import { readStorageBackend } from '@bossraid/constants';
import { evaluateSubmission } from '@bossraid/evaluation';
import { computePrivacyCompliance, buildPrivacyComplianceRecord } from '@bossraid/privacy-engine';
import {
  InMemoryBossRaidPersistence,
  createSecretCipher,
  type BossRaidPersistence,
  type SecretCipher,
} from '@bossraid/persistence';
import {
  buildProviderProfileFromRegistration,
  createProviderFromProfile,
  createProvidersFromProfiles,
  loadProviderProfilesFromFile,
  probeProviderHealth,
  type RaidProvider,
} from '@bossraid/provider-sdk';
import { DEFAULT_TIMEOUTS, rankSubmissions, selectProviders } from '@bossraid/raid-core';
import { buildDiscoveryQueryFromTask, refreshProviderScores } from '@bossraid/provider-registry';
import type {
  BossRaidReplayOutput,
  BossRaidResultOutput,
  BossRaidRoutingProof,
  ProviderFailure,
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  AgentHeartbeatInput,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderDiscoveryQuery,
  ProviderRegistrationInput,
  ProviderSubmission,
  BossRaidPersistenceSnapshot,
  RaidRecord,
  RaidLaunchReservationRecord,
  RankedSubmission,
  ReputationEventType,
  SanitizedTaskSpec,
  SelectedProviders,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import {
  applyReputationEventToProvider,
  createProviderReputationEvent,
  hasRaidVolumeEventForProvider,
  RAID_VOLUME_EVENT_TYPES,
} from './reputation.js';
import {
  buildAdaptivePlanningOutput,
  applyDisqualificationToRaid,
  buildRaidStatusOutput,
  finalizeRaidRecord,
  shouldFinalizeRaid,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from './raid-state.js';
import { delay, readRuntimeOptionsFromEnv, type RuntimeOptions } from './runtime.js';
import { createSettlementExecutor, type SettlementExecuteOptions } from './settlement-executor.js';
import { buildSettlementSummary } from './settlement.js';
import { buildSynthesizedOutput } from './synthesis.js';
import {
  dispatchProvider as dispatchProviderToRuntime,
  markAssignmentFailed as markProviderAssignmentFailed,
  markHeartbeat as markProviderHeartbeat,
  markTimedOut as markProviderTimedOut,
  resumeRaid as resumeRaidDispatch,
  runHierarchicalRaid as runHierarchicalRaidDispatch,
  runRaid as runRaidDispatch,
  submitResult as submitProviderResult,
  type RaidProviderDispatchDeps,
} from './raid-provider-dispatch.js';
import { maybeReplanHierarchicalRaid } from './raid-adaptive.js';
import {
  computeRootDeadlineUnix,
  countPreparedExperts,
  createLaunchReservationRecord,
  findReusableLaunchReservation,
  hydrateLaunchReservation,
  launchReservationExpired,
  prepareRaid,
  pruneLaunchReservations,
  spawnPreparedRaid,
  InvalidRaidLaunchReservationError,
} from './raid-launch.js';
import { RaidDeadlineTimerRegistry } from './raid-timers.js';
import {
  dropProviderAliases,
  filterProvidersByDiscoveryQuery,
  normalizeProviderEndpoint,
} from './provider-registry-local.js';
import { ProviderTimerRegistry } from './timer-registry.js';
import { createPersistenceBackend } from './persistence-backend.js';
import { ProviderHealthCache } from './provider-health-cache.js';
import { PersistenceQueue, PersistenceUnavailableError } from './persistence-queue.js';
import {
  buildOrchestratorSnapshot,
  queueOrchestratorPersist,
  queueOrchestratorPersistBestEffort,
  restoreOrchestratorState,
} from './orchestrator-persistence.js';
import {
  filterReadyProvidersForRaid,
  refreshProviderAvailability as refreshProviderAvailabilityState,
  refreshProviderLiveness as refreshProviderLivenessState,
} from './orchestrator-provider-lifecycle.js';
import {
  buildAdaptiveReplanDeps,
  buildPrepareRaidDeps,
  buildRaidProviderDispatchDeps,
  buildSpawnPreparedRaidDeps,
  type RaidRunnerContext,
} from './raid-runner-deps.js';
import {
  buildRaidRoutingProofOutput,
  collectLeafRaids,
  getRaidStatusOutput,
  refreshParentRaidFromChildren,
} from './raid-hierarchical.js';
import { findWorkspaceRoot, resolveWorkspacePath } from './workspace.js';

export { InvalidRaidLaunchReservationError, NoEligibleProvidersError } from './raid-launch.js';
export { PersistenceUnavailableError } from './persistence-queue.js';

const RAID_POLL_INTERVAL_MS = 250;

export class UnknownRaidError extends Error {
  constructor(raidId: string) {
    super(`Unknown raid: ${raidId}`);
    this.name = 'UnknownRaidError';
  }
}

type ProviderHealthProbe = typeof probeProviderHealth;

type LaunchReservationOptions = {
  route: 'raid' | 'chat';
  requestKey: string;
  holdUntilUnix?: number;
};

function settlementExecutionEquals(
  left: SettlementExecutionRecord | undefined,
  right: SettlementExecutionRecord | undefined
): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export class BossRaidOrchestrator {
  private readonly providers = new Map<string, ProviderProfile>();
  private readonly providerRuntimes = new Map<string, RaidProvider>();
  private readonly seededProviderIds = new Set<string>();
  private readonly raids = new Map<string, RaidRecord>();
  private readonly launchReservations = new Map<string, RaidLaunchReservationRecord>();
  private readonly timers = new ProviderTimerRegistry();
  private readonly raidDeadlineTimers = new RaidDeadlineTimerRegistry();
  private readonly providerHealthCache: ProviderHealthCache;
  private readonly options: RuntimeOptions;
  private readonly persistence: BossRaidPersistence;
  private readonly secretCipher: SecretCipher;
  private readonly settlementExecutor: {
    execute(
      raid: RaidRecord,
      options?: SettlementExecuteOptions
    ): Promise<import('@bossraid/shared-types').SettlementExecutionRecord | undefined>;
  };
  private readonly persistenceQueue = new PersistenceQueue();
  private roundRobinCursor = 0;

  constructor(
    seedProviders: RaidProvider[] = [],
    options: Partial<RuntimeOptions> = {},
    persistence: BossRaidPersistence = new InMemoryBossRaidPersistence(),
    settlementExecutor: {
      execute(
        raid: RaidRecord,
        options?: SettlementExecuteOptions
      ): Promise<import('@bossraid/shared-types').SettlementExecutionRecord | undefined>;
    } = { execute: async () => undefined },
    providerHealthProbe: ProviderHealthProbe = probeProviderHealth
  ) {
    this.options = { ...DEFAULT_TIMEOUTS, ...options };
    this.persistence = persistence;
    this.secretCipher = createSecretCipher(process.env);
    this.settlementExecutor = settlementExecutor;
    this.providerHealthCache = new ProviderHealthCache(undefined, providerHealthProbe);
    for (const provider of seedProviders) {
      this.seededProviderIds.add(provider.profile.providerId);
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: RaidProvider): void {
    refreshProviderScores(provider.profile);
    this.providers.set(provider.profile.providerId, provider.profile);
    this.providerRuntimes.set(provider.profile.providerId, provider);
    this.providerHealthCache.delete(provider.profile.providerId);
  }

  async upsertRegisteredProvider(input: ProviderRegistrationInput): Promise<ProviderProfile> {
    this.assertPersistenceWritable();
    const existing =
      this.providers.get(input.agentId) ??
      [...this.providers.values()].find(
        (provider) =>
          provider.agentId === input.agentId ||
          normalizeProviderEndpoint(provider.endpoint) === normalizeProviderEndpoint(input.endpoint)
      );
    const profile = buildProviderProfileFromRegistration(input, existing);
    profile.status = 'available';
    profile.lastSeenAt = new Date().toISOString();

    this.registerProvider(createProviderFromProfile(profile));
    dropProviderAliases(profile, this.providerRegistryMaps(), { preserveSeededProvider: false });
    await this.queuePersist();
    return profile;
  }

  async recordAgentHeartbeat(input: AgentHeartbeatInput): Promise<ProviderProfile | undefined> {
    this.assertPersistenceWritable();
    this.refreshProviderLiveness();
    const provider =
      this.providers.get(input.agentId) ??
      [...this.providers.values()].find((profile) => profile.agentId === input.agentId);

    if (!provider) {
      return undefined;
    }

    provider.status = input.status ?? 'available';
    provider.lastSeenAt = input.timestamp ?? new Date().toISOString();
    refreshProviderScores(provider);
    await this.queuePersist();
    return provider;
  }

  async discoverProviders(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    await this.refreshProviderAvailability();
    return this.filterDiscoverableProviders(query);
  }

  private async discoverProvidersForRaid(
    query: ProviderDiscoveryQuery = {}
  ): Promise<ProviderProfile[]> {
    const readyProviderIds = await this.refreshProviderAvailability();
    return filterReadyProvidersForRaid(
      this.listProviders(),
      readyProviderIds,
      (providerId) => this.providerHasCapacity(providerId),
      query,
      this.options
    );
  }

  private selectProvidersForTask(
    task: SanitizedTaskSpec,
    providers: ProviderProfile[]
  ): SelectedProviders {
    const selectedProviders = selectProviders(task, providers, this.options.providerFreshMs, {
      skipFreshnessCheck: true,
      roundRobinCursor: this.roundRobinCursor,
    });

    if (selectedProviders.roundRobinCursor !== undefined) {
      this.roundRobinCursor = selectedProviders.roundRobinCursor;
    }

    return selectedProviders;
  }

  private filterDiscoverableProviders(query: ProviderDiscoveryQuery = {}): ProviderProfile[] {
    this.refreshProviderLiveness();
    return filterProvidersByDiscoveryQuery(
      this.listProviders(),
      query,
      this.options.providerFreshMs,
      (providerId) => this.providerHasCapacity(providerId)
    );
  }

  listProviders(): ProviderProfile[] {
    this.refreshProviderLiveness();
    return [...this.providers.values()];
  }

  getProviderProfile(providerId: string): ProviderProfile | undefined {
    this.refreshProviderLiveness();
    return this.providers.get(providerId);
  }

  listRaids(): RaidRecord[] {
    return this.listAllRaids()
      .filter((raid) => raid.parentRaidId == null)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async preflightRaid(input: BossRaidSpawnInput): Promise<void> {
    this.assertPersistenceWritable();
    await prepareRaid(input, this.prepareRaidDeps());
  }

  async reserveRaidLaunch(
    input: BossRaidSpawnInput,
    options: LaunchReservationOptions
  ): Promise<RaidLaunchReservationRecord> {
    this.assertPersistenceWritable();
    this.pruneLaunchReservations();
    const existing = findReusableLaunchReservation(
      this.launchReservations,
      options.route,
      options.requestKey
    );
    if (existing) {
      return existing;
    }

    const prepared = await prepareRaid(input, this.prepareRaidDeps());
    const deadlineUnix = computeRootDeadlineUnix(prepared.sanitized, this.options.raidAbsoluteMs);
    const holdUntilUnix = Math.min(options.holdUntilUnix ?? deadlineUnix, deadlineUnix);
    const record = createLaunchReservationRecord(prepared, {
      route: options.route,
      requestKey: options.requestKey,
      deadlineUnix,
      holdUntilUnix,
    });
    this.launchReservations.set(record.id, record);
    await this.queuePersist();
    return record;
  }

  getRaidLaunchReservation(
    reservationId: string,
    requestKey: string
  ): RaidLaunchReservationRecord | undefined {
    this.pruneLaunchReservations();
    const reservation = this.launchReservations.get(reservationId);
    if (!reservation) {
      return undefined;
    }
    if (reservation.requestKey !== requestKey) {
      return undefined;
    }
    if (!reservation.spawnOutput && launchReservationExpired(reservation)) {
      this.launchReservations.delete(reservation.id);
      this.queuePersistBestEffort();
      return undefined;
    }
    return reservation;
  }

  async spawnReservedRaid(
    reservationId: string,
    requestKey: string,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    this.assertPersistenceWritable();
    const reservation = this.getRaidLaunchReservation(reservationId, requestKey);
    if (!reservation) {
      throw new InvalidRaidLaunchReservationError(
        'Raid launch reservation is missing, expired, or does not match this request.'
      );
    }

    if (reservation.spawnOutput) {
      return reservation.spawnOutput;
    }

    if (reservation.deadlineUnix * 1_000 <= Date.now()) {
      this.launchReservations.delete(reservation.id);
      await this.queuePersist();
      throw new InvalidRaidLaunchReservationError(
        'Raid launch reservation expired before payment completed.'
      );
    }

    const prepared = hydrateLaunchReservation(reservation, (providerId) =>
      this.requireProvider(providerId)
    );
    const spawn = await spawnPreparedRaid(
      prepared,
      reservation.deadlineUnix,
      escrowFundingUsd,
      platformMarkupUsd,
      this.spawnPreparedRaidDeps()
    );
    reservation.spawnOutput = spawn;
    await this.queuePersist();
    return spawn;
  }

  async spawnRaid(
    input: BossRaidSpawnInput,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    this.assertPersistenceWritable();
    const prepared = await prepareRaid(input, this.prepareRaidDeps());
    return spawnPreparedRaid(
      prepared,
      computeRootDeadlineUnix(prepared.sanitized, this.options.raidAbsoluteMs),
      escrowFundingUsd,
      platformMarkupUsd,
      this.spawnPreparedRaidDeps()
    );
  }

  getRaid(raidId: string): RaidRecord | undefined {
    return this.raids.get(raidId);
  }

  async updateSettlementExecution(
    raidId: string,
    settlementExecution: SettlementExecutionRecord
  ): Promise<SettlementExecutionRecord | undefined> {
    const raid = this.raids.get(raidId);
    if (!raid) {
      return undefined;
    }

    if (settlementExecutionEquals(raid.settlementExecution, settlementExecution)) {
      return raid.settlementExecution;
    }

    raid.settlementExecution = settlementExecution;
    raid.updatedAt = new Date().toISOString();
    await this.queuePersist();
    return raid.settlementExecution;
  }

  getPersistenceStatus(): { healthy: boolean; lastError?: string } {
    return {
      healthy: this.persistenceQueue.lastPersistenceError == null,
      lastError: this.persistenceQueue.lastPersistenceError?.message,
    };
  }

  restoreState(snapshot: BossRaidPersistenceSnapshot): boolean {
    return restoreOrchestratorState({
      snapshot,
      secretCipher: this.secretCipher,
      providerRegistryMaps: () => this.providerRegistryMaps(),
      registerProvider: (provider) => this.registerProvider(provider),
      raids: this.raids,
      launchReservations: this.launchReservations,
      listAllRaids: () => this.listAllRaids(),
      requireRaid: (raidId) => this.requireRaid(raidId),
      scheduleRaidDeadline: (raidId) => this.scheduleRaidDeadline(raidId),
      pruneLaunchReservations: (persist) => this.pruneLaunchReservations(persist),
      refreshProviderLiveness: (nowMs) => this.refreshProviderLiveness(nowMs),
    });
  }

  async persistState(): Promise<void> {
    await this.queuePersist();
  }

  async resumeActiveRaids(): Promise<void> {
    const activeRootRaids = this.listAllRaids()
      .filter((raid) => raid.parentRaidId == null && !TERMINAL_RAID_STATUSES.has(raid.status))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

    for (const raid of activeRootRaids) {
      await this.resumeRaid(raid.id);
    }
  }

  getStatus(raidId: string): BossRaidStatusOutput {
    return getRaidStatusOutput(this.requireRaid(raidId), (childRaidId) =>
      this.requireRaid(childRaidId)
    );
  }

  getResult(raidId: string): BossRaidResultOutput {
    const raid = this.requireRaid(raidId);
    if (raid.childRaidIds?.length) {
      refreshParentRaidFromChildren(raidId, (childRaidId) => this.requireRaid(childRaidId));
    }
    const ranked = raid.rankedSubmissions;
    const settlement = buildSettlementSummary(raid);
    const routingProof = buildRaidRoutingProofOutput(
      raid,
      (childRaidId) => this.requireRaid(childRaidId),
      (providerId) => this.providers.get(providerId)
    );

    return {
      raidId,
      status: raid.status,
      synthesizedOutput: raid.synthesizedOutput ?? buildSynthesizedOutput(raid),
      adaptivePlanning: buildAdaptivePlanningOutput(raid),
      routingProof,
      primarySubmission: ranked.find((item) => item.breakdown.valid),
      approvedSubmissions: ranked.filter((item) => item.breakdown.valid),
      rankedSubmissions: ranked,
      settlement,
      settlementExecution: raid.settlementExecution,
      reputationEvents: raid.reputationEvents,
    };
  }

  private listAllRaids(): RaidRecord[] {
    return [...this.raids.values()];
  }

  recordProviderHeartbeat(
    raidId: string,
    providerId: string,
    heartbeat: ProviderHeartbeat
  ): BossRaidStatusOutput {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return buildRaidStatusOutput(raid);
    }
    this.markHeartbeat(raidId, providerId, heartbeat);
    return this.getStatus(raidId);
  }

  async recordProviderSubmission(
    raidId: string,
    submission: ProviderSubmission
  ): Promise<BossRaidResultOutput> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return this.getResult(raidId);
    }
    await this.submitResult(raidId, submission);
    return this.getResult(raidId);
  }

  recordProviderFailure(
    raidId: string,
    providerId: string,
    failure: ProviderFailure
  ): BossRaidStatusOutput {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return buildRaidStatusOutput(raid);
    }
    this.markAssignmentFailed(raidId, providerId, failure.message);
    return this.getStatus(raidId);
  }

  async replayEvaluation(raidId: string): Promise<BossRaidReplayOutput> {
    const raid = this.requireRaid(raidId);
    if (raid.childRaidIds?.length) {
      const leafRaids = collectLeafRaids(raid, (childRaidId) => this.requireRaid(childRaidId));
      let reEvaluated = 0;
      for (const leafRaid of leafRaids) {
        const leafResults = await Promise.all(
          leafRaid.rankedSubmissions.map(async (entry) => ({
            ...entry,
            breakdown: await evaluateSubmission(leafRaid, entry.submission),
          }))
        );
        leafRaid.rankedSubmissions = rankSubmissions(leafResults);
        leafRaid.synthesizedOutput = buildSynthesizedOutput(leafRaid);
        leafRaid.bestCurrentScore = leafRaid.rankedSubmissions[0]?.breakdown.finalScore;
        leafRaid.updatedAt = new Date().toISOString();
        reEvaluated += leafRaid.rankedSubmissions.length;
      }

      refreshParentRaidFromChildren(raidId, (childRaidId) => this.requireRaid(childRaidId));
      this.refreshRaidAncestry(raid.parentRaidId);
      await this.queuePersist();
      return {
        raidId,
        reEvaluated,
      };
    }

    const reEvaluated = await Promise.all(
      raid.rankedSubmissions.map(async (entry) => ({
        ...entry,
        breakdown: await evaluateSubmission(raid, entry.submission),
      }))
    );
    raid.rankedSubmissions = rankSubmissions(reEvaluated);
    raid.synthesizedOutput = buildSynthesizedOutput(raid);
    raid.bestCurrentScore = raid.rankedSubmissions[0]?.breakdown.finalScore;
    raid.updatedAt = new Date().toISOString();
    await this.queuePersist();
    return {
      raidId,
      reEvaluated: raid.rankedSubmissions.length,
    };
  }

  abortRaid(raidId: string): BossRaidStatusOutput {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return this.getStatus(raidId);
    }

    const cancelledAt = new Date().toISOString();
    this.clearRaidDeadlineTimer(raidId);
    raid.status = 'cancelled';
    raid.updatedAt = cancelledAt;
    if (raid.childRaidIds?.length) {
      for (const childRaidId of raid.childRaidIds) {
        this.abortRaid(childRaidId);
      }
    }
    for (const assignment of Object.values(raid.assignments)) {
      this.clearProviderTimers(raidId, assignment.providerId);
      if (!TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        assignment.status = 'disqualified';
        assignment.message = 'raid cancelled';
        assignment.timeoutAt = cancelledAt;
      }
    }
    this.queuePersistBestEffort();
    return this.getStatus(raidId);
  }

  private async resumeRaid(raidId: string): Promise<void> {
    await resumeRaidDispatch(raidId, this.providerDispatchDeps());
  }

  private async runRaid(raidId: string): Promise<void> {
    await runRaidDispatch(raidId, this.providerDispatchDeps());
  }

  private async runHierarchicalRaid(raidId: string): Promise<void> {
    await runHierarchicalRaidDispatch(raidId, this.providerDispatchDeps());
  }

  private async dispatchProvider(raidId: string, providerId: string): Promise<void> {
    await dispatchProviderToRuntime(raidId, providerId, this.providerDispatchDeps());
  }

  private markHeartbeat(raidId: string, providerId: string, heartbeat: ProviderHeartbeat): void {
    markProviderHeartbeat(raidId, providerId, heartbeat, this.providerDispatchDeps());
  }

  private async submitResult(raidId: string, submission: ProviderSubmission): Promise<void> {
    await submitProviderResult(raidId, submission, this.providerDispatchDeps());
  }

  private markTimedOut(raidId: string, providerId: string, reason: string): void {
    markProviderTimedOut(raidId, providerId, reason, this.providerDispatchDeps());
  }

  private markAssignmentFailed(raidId: string, providerId: string, reason: string): void {
    markProviderAssignmentFailed(raidId, providerId, reason, this.providerDispatchDeps());
  }

  private applyProviderRoutingCooldown(providerId: string, cooldownMs = 5 * 60_000): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }
    provider.routingCooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
    this.providers.set(providerId, provider);
    const runtime = this.providerRuntimes.get(providerId);
    if (runtime) {
      (runtime.profile as ProviderProfile).routingCooldownUntil = provider.routingCooldownUntil;
    }
  }

  private expireRaidAtDeadline(raidId: string): void {
    const raid = this.requireRaid(raidId);
    if (
      TERMINAL_RAID_STATUSES.has(raid.status) ||
      !this.raidDeadlineTimers.tryMarkExpiring(raidId)
    ) {
      return;
    }
    this.clearRaidDeadlineTimer(raidId);

    try {
      const reason = 'raid deadline reached before completion';
      if (raid.childRaidIds?.length) {
        for (const childRaidId of raid.childRaidIds) {
          const childRaid = this.requireRaid(childRaidId);
          if (!TERMINAL_RAID_STATUSES.has(childRaid.status)) {
            this.expireRaidAtDeadline(childRaidId);
          }
        }
      }
      for (const providerId of raid.selectedProviders) {
        const assignment = raid.assignments[providerId];
        if (!assignment || TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
          continue;
        }
        if (!applyDisqualificationToRaid(raid, providerId, reason)) {
          continue;
        }

        this.clearProviderTimers(raidId, providerId);
        this.applyReputationEvent(
          providerId,
          assignment.acceptedAt ? 'heartbeat_timeout' : 'invite_timeout',
          { raidId, reason }
        );
      }

      if (raid.parentRaidId) {
        this.refreshRaidAncestry(raid.parentRaidId);
        this.maybeFinalizeAfterUpdate(raid.parentRaidId);
      }
      this.queuePersistBestEffort();
      this.finalizeRaid(raid);
    } finally {
      this.raidDeadlineTimers.unmarkExpiring(raidId);
    }
  }

  private maybeFinalizeAfterUpdate(raidId: string): void {
    const raid = this.requireRaid(raidId);
    if (this.raidDeadlineReached(raid)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }
    if (raid.childRaidIds?.length) {
      refreshParentRaidFromChildren(raidId, (childRaidId) => this.requireRaid(childRaidId));
      if (raid.adaptivePlanning && maybeReplanHierarchicalRaid(raidId, this.adaptiveReplanDeps())) {
        return;
      }
      if (this.shouldFinalizeHierarchicalRaid(raid)) {
        this.finalizeRaid(raid);
        return;
      }
      if (raid.parentRaidId) {
        this.maybeFinalizeAfterUpdate(raid.parentRaidId);
      }
      return;
    }

    if (shouldFinalizeRaid(raid)) {
      this.finalizeRaid(raid);
      return;
    }

    if (raid.parentRaidId) {
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
  }

  private shouldFinalizeHierarchicalRaid(raid: RaidRecord): boolean {
    return (raid.childRaidIds ?? []).every((childRaidId) =>
      TERMINAL_RAID_STATUSES.has(this.requireRaid(childRaidId).status)
    );
  }

  private refreshRaidAncestry(raidId: string | undefined): void {
    let currentRaidId = raidId;

    while (currentRaidId) {
      refreshParentRaidFromChildren(currentRaidId, (childRaidId) => this.requireRaid(childRaidId));
      currentRaidId = this.requireRaid(currentRaidId).parentRaidId;
    }
  }

  private finalizeRaid(raid: RaidRecord): void {
    this.clearRaidDeadlineTimer(raid.id);
    if (raid.childRaidIds?.length) {
      refreshParentRaidFromChildren(raid.id, (childRaidId) => this.requireRaid(childRaidId));
    }
    finalizeRaidRecord(raid);

    if (raid.parentRaidId == null) {
      for (const submission of raid.rankedSubmissions.filter((item) => item.breakdown.valid)) {
        this.applyReputationEvent(submission.submission.providerId, 'successful_provider', {
          raidId: raid.id,
        });
      }
    }

    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
    this.queuePersistBestEffort();
    if (raid.parentRaidId == null) {
      void this.executeSettlement(raid.id);
    }
  }

  private async waitForFinalization(raidId: string): Promise<void> {
    const deadline = this.requireRaid(raidId).deadlineUnix * 1_000;

    while (Date.now() < deadline) {
      const raid = this.requireRaid(raidId);
      if (TERMINAL_RAID_STATUSES.has(raid.status)) {
        return;
      }
      await delay(RAID_POLL_INTERVAL_MS);
    }

    const raid = this.requireRaid(raidId);
    if (!TERMINAL_RAID_STATUSES.has(raid.status)) {
      this.expireRaidAtDeadline(raidId);
    }
  }

  private applyReputationEvent(
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>
  ): void {
    const profile = this.providers.get(providerId);
    if (!profile) {
      return;
    }

    const event = createProviderReputationEvent(providerId, type, context);
    applyReputationEventToProvider(
      profile,
      event,
      RAID_VOLUME_EVENT_TYPES.has(type) &&
        !hasRaidVolumeEventForProvider(this.raids.get(String(context?.raidId ?? '')), providerId)
    );

    let currentRaidId = typeof context?.raidId === 'string' ? context.raidId : undefined;
    while (currentRaidId) {
      const raid = this.raids.get(currentRaidId);
      if (!raid) {
        break;
      }
      raid.reputationEvents.push(event);
      currentRaidId = raid.parentRaidId;
    }
    this.queuePersistBestEffort();
  }

  private snapshotState(): BossRaidPersistenceSnapshot {
    return buildOrchestratorSnapshot({
      listAllRaids: () => this.listAllRaids(),
      listProviders: () => this.listProviders(),
      launchReservations: this.launchReservations,
      secretCipher: this.secretCipher,
      refreshProviderLiveness: (nowMs) => this.refreshProviderLiveness(nowMs),
      pruneLaunchReservations: (persist) => this.pruneLaunchReservations(persist),
    });
  }

  private queuePersist(): Promise<void> {
    return queueOrchestratorPersist(this.persistenceQueue, this.persistence, () =>
      this.snapshotState()
    );
  }

  private queuePersistBestEffort(): void {
    queueOrchestratorPersistBestEffort(this.persistenceQueue, this.persistence, () =>
      this.snapshotState()
    );
  }

  private assertPersistenceWritable(): void {
    this.persistenceQueue.assertWritable();
  }

  private requireRaid(raidId: string): RaidRecord {
    const raid = this.raids.get(raidId);
    if (!raid) {
      throw new UnknownRaidError(raidId);
    }
    return raid;
  }

  private clearProviderTimers(raidId: string, providerId: string): void {
    this.timers.clearAll(raidId, providerId);
  }

  private scheduleRaidDeadline(raidId: string): void {
    const raid = this.requireRaid(raidId);
    this.raidDeadlineTimers.schedule(raidId, raid, (id) => this.expireRaidAtDeadline(id));
  }

  private clearRaidDeadlineTimer(raidId: string): void {
    this.raidDeadlineTimers.clear(raidId);
  }

  private raidDeadlineReached(raid: RaidRecord): boolean {
    return RaidDeadlineTimerRegistry.deadlineReached(raid);
  }

  private pruneLaunchReservations(persist = true): void {
    pruneLaunchReservations(this.launchReservations, () => this.queuePersistBestEffort(), persist);
  }

  private requireProvider(providerId: string): ProviderProfile {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new InvalidRaidLaunchReservationError(
        `Reserved provider ${providerId} is no longer registered with Mercenary.`
      );
    }
    return provider;
  }

  private providerHasCapacity(providerId: string): boolean {
    const profile = this.providers.get(providerId);
    if (!profile) {
      return false;
    }

    return this.getActiveAssignmentCount(providerId) < Math.max(profile.maxConcurrency, 1);
  }

  private getActiveAssignmentCount(providerId: string): number {
    let activeAssignments = 0;

    for (const raid of this.raids.values()) {
      if (TERMINAL_RAID_STATUSES.has(raid.status)) {
        continue;
      }

      if (raid.adaptivePlanning?.availableProviderIds.includes(providerId)) {
        activeAssignments += 1;
      }

      const assignment = raid.assignments[providerId];
      if (!assignment || TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        continue;
      }

      activeAssignments += 1;
    }

    for (const reservation of this.launchReservations.values()) {
      if (reservation.spawnOutput || launchReservationExpired(reservation)) {
        continue;
      }
      if (reservation.reservedProviderIds.includes(providerId)) {
        activeAssignments += 1;
      }
    }

    return activeAssignments;
  }

  private refreshProviderLiveness(nowMs: number = Date.now()): void {
    refreshProviderLivenessState(this.providers.values(), this.options.providerFreshMs, nowMs);
  }

  private async executeSettlement(raidId: string): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (raid.parentRaidId || raid.settlementExecution || raid.status !== 'final') {
      return;
    }

    const privacyConstraints = raid.task.constraints;
    const privacyMode = privacyConstraints.privacyMode ?? 'off';
    if (privacyMode !== 'off' && privacyConstraints.requirePrivacyFeatures?.length) {
      const complianceRecord = buildPrivacyComplianceRecord(
        raid.id,
        privacyMode,
        privacyConstraints.requirePrivacyFeatures,
        raid.rankedSubmissions,
        raid.task.sanitizationReport
      );
      if (!complianceRecord.overallPassed) {
        raid.settlementExecution = {
          mode: 'file',
          proofStandard: 'erc8183_aligned',
          lifecycleStatus: 'synthetic',
          executedAt: new Date().toISOString(),
          artifactPath: '',
          registryRaidRef: raid.id,
          taskHash: '',
          evaluationHash: '',
          successfulProviderIds: [],
          privacyCompliance: complianceRecord,
          allocations: [],
          contracts: {
            registryAddress: null,
            escrowAddress: null,
            tokenAddress: null,
            clientAddress: null,
            evaluatorAddress: null,
            chainId: null,
            rpcUrl: null,
          },
          registryCall: {
            method: 'finalizeRaid',
            args: [raid.id, '0x0000000000000000000000000000000000000000'],
          },
          childJobs: [],
          warnings: ['privacy-compliance-failed'],
        };
        raid.updatedAt = new Date().toISOString();
        await this.queuePersist();
        return;
      }
    }

    const record = await this.settlementExecutor.execute(
      raid,
      this.buildSettlementExecuteOptions(raid)
    );
    if (!record) {
      return;
    }

    raid.settlementExecution = record;
    if (privacyMode !== 'off' && privacyConstraints.requirePrivacyFeatures?.length) {
      const complianceRecord = buildPrivacyComplianceRecord(
        raid.id,
        privacyMode,
        privacyConstraints.requirePrivacyFeatures,
        raid.rankedSubmissions,
        raid.task.sanitizationReport
      );
      raid.settlementExecution.privacyCompliance = complianceRecord;
    }
    raid.updatedAt = new Date().toISOString();
    await this.queuePersist();
  }

  private buildSettlementExecuteOptions(raid: RaidRecord): SettlementExecuteOptions {
    const providerAddressMap: Record<string, string> = {};
    for (const providerId of raid.selectedProviders) {
      const operatorWallet = this.providers.get(providerId)?.erc8004?.operatorWallet?.trim();
      if (operatorWallet) {
        providerAddressMap[providerId] = operatorWallet;
      }
    }

    return { providerAddressMap };
  }

  private async refreshProviderAvailability(): Promise<Set<string>> {
    return refreshProviderAvailabilityState({
      providers: [...this.providers.values()],
      providerHealthCache: this.providerHealthCache,
      providerFreshMs: this.options.providerFreshMs,
    });
  }

  private raidRunnerContext(): RaidRunnerContext {
    return {
      requireRaid: (raidId) => this.requireRaid(raidId),
      getProvider: (providerId) => this.providers.get(providerId),
      getProviderRuntime: (providerId) => this.providerRuntimes.get(providerId),
      updateProviderProfile: (providerId, update) => {
        const profile = this.providers.get(providerId);
        if (!profile) {
          return;
        }
        update(profile);
        this.providers.set(providerId, profile);
        const runtime = this.providerRuntimes.get(providerId);
        if (runtime) {
          Object.assign(runtime.profile as ProviderProfile, profile);
        }
      },
      options: this.options,
      timers: this.timers,
      raids: this.raids,
      providers: this.providers,
      clearProviderTimers: (raidId, providerId) => this.clearProviderTimers(raidId, providerId),
      queuePersistBestEffort: () => this.queuePersistBestEffort(),
      queuePersist: () => this.queuePersist(),
      raidDeadlineReached: (raid) => this.raidDeadlineReached(raid),
      expireRaidAtDeadline: (raidId) => this.expireRaidAtDeadline(raidId),
      scheduleRaidDeadline: (raidId) => this.scheduleRaidDeadline(raidId),
      refreshRaidAncestry: (raidId) => this.refreshRaidAncestry(raidId),
      maybeFinalizeAfterUpdate: (raidId) => this.maybeFinalizeAfterUpdate(raidId),
      applyReputationEvent: (providerId, type, context) =>
        this.applyReputationEvent(providerId, type, context),
      applyProviderRoutingCooldown: (providerId, cooldownMs) =>
        this.applyProviderRoutingCooldown(providerId, cooldownMs),
      finalizeRaid: (raid) => this.finalizeRaid(raid),
      shouldFinalizeHierarchicalRaid: (raid) => this.shouldFinalizeHierarchicalRaid(raid),
      waitForFinalization: (raidId) => this.waitForFinalization(raidId),
      runRaid: (raidId) => {
        void this.runRaid(raidId);
      },
      discoverProvidersForRaid: (query) => this.discoverProvidersForRaid(query),
      selectProvidersForTask: (task, providers) => this.selectProvidersForTask(task, providers),
      instantiatePreparedChildrenDeps: () => ({
        raids: this.raids,
        requireRaid: (raidId: string) => this.requireRaid(raidId),
        scheduleRaidDeadline: (raidId: string) => this.scheduleRaidDeadline(raidId),
      }),
    };
  }

  private providerDispatchDeps(): RaidProviderDispatchDeps {
    return buildRaidProviderDispatchDeps(this.raidRunnerContext());
  }

  private prepareRaidDeps() {
    return buildPrepareRaidDeps(this.raidRunnerContext());
  }

  private spawnPreparedRaidDeps() {
    return buildSpawnPreparedRaidDeps(this.raidRunnerContext());
  }

  private adaptiveReplanDeps() {
    return buildAdaptiveReplanDeps(this.raidRunnerContext());
  }

  private providerRegistryMaps() {
    return {
      providers: this.providers,
      providerRuntimes: this.providerRuntimes,
      providerHealthCache: this.providerHealthCache,
      seededProviderIds: this.seededProviderIds,
    };
  }
}

export async function createDefaultOrchestrator(
  options: Partial<RuntimeOptions> = {}
): Promise<BossRaidOrchestrator> {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const stateFile = resolveWorkspacePath(process.env.BOSSRAID_STATE_FILE, workspaceCwd);
  const sqliteFile = resolveWorkspacePath(
    process.env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
    workspaceCwd
  );
  const providersFile = resolveWorkspacePath(process.env.BOSSRAID_PROVIDERS_FILE, workspaceCwd);
  const storageBackend = readStorageBackend(process.env, { strict: true });

  const persistence = createPersistenceBackend({
    storageBackend,
    stateFile,
    sqliteFile,
  });
  const snapshot = await persistence.loadState();

  if (!providersFile) {
    throw new Error(
      'BOSSRAID_PROVIDERS_FILE is required. Mercenary no longer boots with simulated providers.'
    );
  }

  const profiles = await loadProviderProfilesFromFile(providersFile);
  if (profiles.length === 0) {
    throw new Error(
      `No providers found in ${providersFile}. Configure at least one HTTP provider.`
    );
  }

  const settlementExecutor = createSettlementExecutor(process.env, workspaceCwd);
  const orchestrator = new BossRaidOrchestrator(
    createProvidersFromProfiles(profiles),
    options,
    persistence,
    settlementExecutor
  );
  if (orchestrator.restoreState(snapshot)) {
    await orchestrator.persistState();
  }
  await orchestrator.resumeActiveRaids();
  return orchestrator;
}

export function runtimeOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Partial<RuntimeOptions> {
  return readRuntimeOptionsFromEnv(env);
}
