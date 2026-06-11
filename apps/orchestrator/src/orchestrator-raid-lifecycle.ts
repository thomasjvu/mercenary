import { evaluateSubmission } from '@bossraid/evaluation';
import { rankSubmissions } from '@bossraid/raid-core';
import type {
  BossRaidReplayOutput,
  BossRaidResultOutput,
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderSubmission,
  RaidLaunchReservationRecord,
  RaidRecord,
  ReputationEventType,
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
  buildRaidStatusOutput,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from './raid-state.js';
import type { SettlementExecuteOptions } from './settlement-executor.js';
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
import {
  computeRootDeadlineUnix,
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
  expireRaidAtDeadline as expireRaidAtDeadlineState,
  finalizeRaid as finalizeRaidState,
  maybeFinalizeAfterUpdate as maybeFinalizeAfterUpdateState,
  shouldFinalizeHierarchicalRaid as shouldFinalizeHierarchicalRaidState,
  waitForFinalization as waitForFinalizationState,
  type OrchestratorFinalizationDeps,
} from './orchestrator-finalization.js';
import {
  executeSettlement as executeRaidSettlement,
  type OrchestratorSettlementRunnerDeps,
} from './orchestrator-settlement-runner.js';
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
import { ProviderTimerRegistry } from './timer-registry.js';
import type { ProviderRegistryCoordinator } from './orchestrator-provider-registry.js';
import type { RuntimeOptions } from './runtime.js';

export class UnknownRaidError extends Error {
  constructor(raidId: string) {
    super(`Unknown raid: ${raidId}`);
    this.name = 'UnknownRaidError';
  }
}

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

export type RaidLifecycleCoordinatorDeps = {
  assertPersistenceWritable: () => void;
  queuePersist: () => Promise<void>;
  queuePersistBestEffort: () => void;
  providerRegistry: ProviderRegistryCoordinator;
  settlementExecutor: {
    execute(
      raid: RaidRecord,
      options?: SettlementExecuteOptions
    ): Promise<SettlementExecutionRecord | undefined>;
  };
};

export class RaidLifecycleCoordinator {
  readonly raids = new Map<string, RaidRecord>();
  readonly launchReservations = new Map<string, RaidLaunchReservationRecord>();
  readonly timers = new ProviderTimerRegistry();
  readonly raidDeadlineTimers = new RaidDeadlineTimerRegistry();

  constructor(
    private readonly options: RuntimeOptions,
    private readonly deps: RaidLifecycleCoordinatorDeps
  ) {}

  listRaids(): RaidRecord[] {
    return this.listAllRaids()
      .filter((raid) => raid.parentRaidId == null)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  listAllRaids(): RaidRecord[] {
    return [...this.raids.values()];
  }

  async preflightRaid(input: BossRaidSpawnInput): Promise<void> {
    this.deps.assertPersistenceWritable();
    await prepareRaid(input, this.prepareRaidDeps());
  }

  async reserveRaidLaunch(
    input: BossRaidSpawnInput,
    options: LaunchReservationOptions
  ): Promise<RaidLaunchReservationRecord> {
    this.deps.assertPersistenceWritable();
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
    await this.deps.queuePersist();
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
      this.deps.queuePersistBestEffort();
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
    this.deps.assertPersistenceWritable();
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
      await this.deps.queuePersist();
      throw new InvalidRaidLaunchReservationError(
        'Raid launch reservation expired before payment completed.'
      );
    }

    const prepared = hydrateLaunchReservation(reservation, (providerId) =>
      this.deps.providerRegistry.requireProvider(providerId)
    );
    const spawn = await spawnPreparedRaid(
      prepared,
      reservation.deadlineUnix,
      escrowFundingUsd,
      platformMarkupUsd,
      this.spawnPreparedRaidDeps()
    );
    reservation.spawnOutput = spawn;
    await this.deps.queuePersist();
    return spawn;
  }

  async spawnRaid(
    input: BossRaidSpawnInput,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    this.deps.assertPersistenceWritable();
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
    await this.deps.queuePersist();
    return raid.settlementExecution;
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
      (providerId) => this.deps.providerRegistry.providers.get(providerId)
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
      await this.deps.queuePersist();
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
    await this.deps.queuePersist();
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
    this.deps.queuePersistBestEffort();
    return this.getStatus(raidId);
  }

  async resumeActiveRaids(): Promise<void> {
    const activeRootRaids = this.listAllRaids()
      .filter((raid) => raid.parentRaidId == null && !TERMINAL_RAID_STATUSES.has(raid.status))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

    for (const raid of activeRootRaids) {
      await this.resumeRaid(raid.id);
    }
  }

  requireRaid(raidId: string): RaidRecord {
    const raid = this.raids.get(raidId);
    if (!raid) {
      throw new UnknownRaidError(raidId);
    }
    return raid;
  }

  pruneLaunchReservations(persist = true): void {
    pruneLaunchReservations(
      this.launchReservations,
      () => this.deps.queuePersistBestEffort(),
      persist
    );
  }

  scheduleRaidDeadline(raidId: string): void {
    const raid = this.requireRaid(raidId);
    this.raidDeadlineTimers.schedule(raidId, raid, (id) => this.expireRaidAtDeadline(id));
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

  private expireRaidAtDeadline(raidId: string): void {
    expireRaidAtDeadlineState(raidId, this.finalizationDeps());
  }

  private maybeFinalizeAfterUpdate(raidId: string): void {
    maybeFinalizeAfterUpdateState(raidId, this.finalizationDeps());
  }

  private shouldFinalizeHierarchicalRaid(raid: RaidRecord): boolean {
    return shouldFinalizeHierarchicalRaidState(raid, this.finalizationDeps());
  }

  private refreshRaidAncestry(raidId: string | undefined): void {
    let currentRaidId = raidId;

    while (currentRaidId) {
      refreshParentRaidFromChildren(currentRaidId, (childRaidId) => this.requireRaid(childRaidId));
      currentRaidId = this.requireRaid(currentRaidId).parentRaidId;
    }
  }

  private finalizeRaid(raid: RaidRecord): void {
    finalizeRaidState(raid, this.finalizationDeps());
  }

  private async waitForFinalization(raidId: string): Promise<void> {
    await waitForFinalizationState(raidId, this.finalizationDeps());
  }

  private applyReputationEvent(
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>
  ): void {
    const profile = this.deps.providerRegistry.providers.get(providerId);
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
    this.deps.queuePersistBestEffort();
  }

  private clearProviderTimers(raidId: string, providerId: string): void {
    this.timers.clearAll(raidId, providerId);
  }

  private clearRaidDeadlineTimer(raidId: string): void {
    this.raidDeadlineTimers.clear(raidId);
  }

  private raidDeadlineReached(raid: RaidRecord): boolean {
    return RaidDeadlineTimerRegistry.deadlineReached(raid);
  }

  private async executeSettlement(raidId: string): Promise<void> {
    await executeRaidSettlement(raidId, this.settlementRunnerDeps());
  }

  private raidRunnerContext(): RaidRunnerContext {
    const registry = this.deps.providerRegistry;
    return {
      requireRaid: (raidId) => this.requireRaid(raidId),
      getProvider: (providerId) => registry.providers.get(providerId),
      getProviderRuntime: (providerId) => registry.providerRuntimes.get(providerId),
      updateProviderProfile: (providerId, update) =>
        registry.updateProviderProfile(providerId, update),
      options: this.options,
      timers: this.timers,
      raids: this.raids,
      providers: registry.providers,
      clearProviderTimers: (raidId, providerId) => this.clearProviderTimers(raidId, providerId),
      queuePersistBestEffort: () => this.deps.queuePersistBestEffort(),
      queuePersist: () => this.deps.queuePersist(),
      raidDeadlineReached: (raid) => this.raidDeadlineReached(raid),
      expireRaidAtDeadline: (raidId) => this.expireRaidAtDeadline(raidId),
      scheduleRaidDeadline: (raidId) => this.scheduleRaidDeadline(raidId),
      refreshRaidAncestry: (raidId) => this.refreshRaidAncestry(raidId),
      maybeFinalizeAfterUpdate: (raidId) => this.maybeFinalizeAfterUpdate(raidId),
      applyReputationEvent: (providerId, type, context) =>
        this.applyReputationEvent(providerId, type, context),
      applyProviderRoutingCooldown: (providerId, cooldownMs) =>
        registry.applyProviderRoutingCooldown(providerId, cooldownMs),
      finalizeRaid: (raid) => this.finalizeRaid(raid),
      shouldFinalizeHierarchicalRaid: (raid) => this.shouldFinalizeHierarchicalRaid(raid),
      waitForFinalization: (raidId) => this.waitForFinalization(raidId),
      runRaid: (raidId) => {
        void this.runRaid(raidId);
      },
      discoverProvidersForRaid: (query) => registry.discoverProvidersForRaid(query),
      selectProvidersForTask: (task, providers) => registry.selectProvidersForTask(task, providers),
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

  private settlementRunnerDeps(): OrchestratorSettlementRunnerDeps {
    return {
      requireRaid: (raidId) => this.requireRaid(raidId),
      providers: this.deps.providerRegistry.providers,
      settlementExecutor: this.deps.settlementExecutor,
      queuePersist: () => this.deps.queuePersist(),
    };
  }

  private finalizationDeps(): OrchestratorFinalizationDeps {
    return {
      requireRaid: (raidId) => this.requireRaid(raidId),
      raidDeadlineTimers: this.raidDeadlineTimers,
      clearRaidDeadlineTimer: (raidId) => this.clearRaidDeadlineTimer(raidId),
      clearProviderTimers: (raidId, providerId) => this.clearProviderTimers(raidId, providerId),
      applyReputationEvent: (providerId, type, context) =>
        this.applyReputationEvent(providerId, type, context),
      refreshRaidAncestry: (raidId) => this.refreshRaidAncestry(raidId),
      queuePersistBestEffort: () => this.deps.queuePersistBestEffort(),
      executeSettlement: (raidId) => this.executeSettlement(raidId),
      raidDeadlineReached: (raid) => this.raidDeadlineReached(raid),
      adaptiveReplanDeps: () => this.adaptiveReplanDeps(),
    };
  }
}
