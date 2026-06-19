import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  AgentHeartbeatInput,
  BossRaidReplayOutput,
  BossRaidResultOutput,
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  ProviderDiscoveryQuery,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderRegistrationInput,
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
import { TERMINAL_RAID_STATUSES } from './raid-state.js';
import type { SettlementExecuteOptions } from './settlement-executor.js';
import {
  resumeRaid as resumeRaidDispatch,
  runRaid as runRaidDispatch,
} from './raid-provider-dispatch.js';
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
  shouldRunSettlement,
  type OrchestratorSettlementRunnerDeps,
} from './orchestrator-settlement-runner.js';
import {
  createAdaptiveReplanDeps,
  createPrepareRaidDeps,
  createRaidRunnerContext,
  createSpawnPreparedRaidDeps,
  type RaidRunnerContext,
} from './raid-runner-deps.js';
import { refreshParentRaidFromChildren } from './raid-hierarchy.js';
import { ProviderTimerRegistry } from './timer-registry.js';
import type { ProviderRegistryCoordinator } from './orchestrator-provider-registry.js';
import type { RuntimeOptions } from './runtime.js';
import {
  abortRaid as abortRaidIngress,
  recordProviderFailure as recordProviderFailureIngress,
  recordProviderHeartbeat as recordProviderHeartbeatIngress,
  recordProviderSubmission as recordProviderSubmissionIngress,
  type RaidLifecycleIngressContext,
} from './raid-lifecycle-ingress.js';
import {
  getRaid as getRaidQuery,
  getResult as getResultQuery,
  getStatus as getStatusQuery,
  listAllRaids as listAllRaidsQuery,
  listRaids as listRaidsQuery,
  replayEvaluation as replayEvaluationQuery,
  updateSettlementExecution as updateSettlementExecutionQuery,
  type RaidLifecycleQueriesContext,
} from './raid-lifecycle-queries.js';
import {
  getRaidLaunchReservation as getRaidLaunchReservationSpawn,
  preflightRaid as preflightRaidSpawn,
  pruneLaunchReservations as pruneLaunchReservationsSpawn,
  reserveRaidLaunch as reserveRaidLaunchSpawn,
  spawnRaid as spawnRaidSpawn,
  spawnReservedRaid as spawnReservedRaidSpawn,
  type LaunchReservationOptions,
  type RaidLifecycleSpawnContext,
} from './raid-lifecycle-spawn.js';

export class UnknownRaidError extends Error {
  constructor(raidId: string) {
    super(`Unknown raid: ${raidId}`);
    this.name = 'UnknownRaidError';
  }
}

export type RaidLifecycleCoordinatorDeps = {
  assertPersistenceWritable: () => void;
  queuePersist: () => Promise<void>;
  queuePersistBestEffort: () => void;
  providerRegistry: ProviderRegistryCoordinator;
  getProviderCapacityDeps: () => import('./orchestrator-provider-capacity.js').OrchestratorProviderCapacityDeps;
  settlementOutputDir?: string;
  settlementExecutor: {
    execute(
      raid: RaidRecord,
      options?: SettlementExecuteOptions
    ): Promise<SettlementExecutionRecord | undefined>;
    resume(
      raid: RaidRecord,
      existing: SettlementExecutionRecord,
      options?: SettlementExecuteOptions
    ): Promise<SettlementExecutionRecord | undefined>;
  };
};

export class RaidLifecycleCoordinator {
  readonly raids = new Map<string, RaidRecord>();
  readonly launchReservations = new Map<string, RaidLaunchReservationRecord>();
  readonly timers = new ProviderTimerRegistry();
  readonly raidDeadlineTimers = new RaidDeadlineTimerRegistry();
  private runnerContext?: RaidRunnerContext;

  constructor(
    private readonly options: RuntimeOptions,
    private readonly deps: RaidLifecycleCoordinatorDeps
  ) {}

  registerProvider(provider: RaidProvider): void {
    this.deps.providerRegistry.registerProvider(provider);
  }

  async upsertRegisteredProvider(input: ProviderRegistrationInput): Promise<ProviderProfile> {
    return this.deps.providerRegistry.upsertRegisteredProvider(input);
  }

  async recordAgentHeartbeat(input: AgentHeartbeatInput): Promise<ProviderProfile | undefined> {
    return this.deps.providerRegistry.recordAgentHeartbeat(input);
  }

  async discoverProviders(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    return this.deps.providerRegistry.discoverProviders(query);
  }

  listProviders(): ProviderProfile[] {
    return this.deps.providerRegistry.listProviders();
  }

  getProviderProfile(providerId: string): ProviderProfile | undefined {
    return this.deps.providerRegistry.getProviderProfile(providerId);
  }

  listRaids(): RaidRecord[] {
    return listRaidsQuery(this.queriesContext());
  }

  listAllRaids(): RaidRecord[] {
    return listAllRaidsQuery(this.queriesContext());
  }

  async preflightRaid(input: BossRaidSpawnInput): Promise<void> {
    return preflightRaidSpawn(this.spawnContext(), input);
  }

  async reserveRaidLaunch(
    input: BossRaidSpawnInput,
    options: LaunchReservationOptions
  ): Promise<RaidLaunchReservationRecord> {
    return reserveRaidLaunchSpawn(this.spawnContext(), input, options);
  }

  getRaidLaunchReservation(
    reservationId: string,
    requestKey: string
  ): RaidLaunchReservationRecord | undefined {
    return getRaidLaunchReservationSpawn(this.spawnContext(), reservationId, requestKey);
  }

  async spawnReservedRaid(
    reservationId: string,
    requestKey: string,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    return spawnReservedRaidSpawn(
      this.spawnContext(),
      reservationId,
      requestKey,
      escrowFundingUsd,
      platformMarkupUsd
    );
  }

  async spawnRaid(
    input: BossRaidSpawnInput,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    return spawnRaidSpawn(this.spawnContext(), input, escrowFundingUsd, platformMarkupUsd);
  }

  getRaid(raidId: string): RaidRecord | undefined {
    return getRaidQuery(this.queriesContext(), raidId);
  }

  async updateSettlementExecution(
    raidId: string,
    settlementExecution: SettlementExecutionRecord
  ): Promise<SettlementExecutionRecord | undefined> {
    return updateSettlementExecutionQuery(this.queriesContext(), raidId, settlementExecution);
  }

  getStatus(raidId: string): BossRaidStatusOutput {
    return getStatusQuery(this.queriesContext(), raidId);
  }

  getResult(raidId: string): BossRaidResultOutput {
    return getResultQuery(this.queriesContext(), raidId);
  }

  attachRaidPaymentProof(
    raidId: string,
    paymentProof: import('@bossraid/shared-types').RaidPaymentProof
  ): void {
    const raid = this.raids.get(raidId);
    if (!raid) {
      return;
    }

    raid.paymentProof = paymentProof;
    raid.updatedAt = new Date().toISOString();
    this.deps.queuePersistBestEffort();
  }

  recordProviderHeartbeat(
    raidId: string,
    providerId: string,
    heartbeat: ProviderHeartbeat
  ): BossRaidStatusOutput {
    return recordProviderHeartbeatIngress(this.ingressContext(), raidId, providerId, heartbeat);
  }

  async recordProviderSubmission(
    raidId: string,
    submission: ProviderSubmission
  ): Promise<BossRaidResultOutput> {
    return recordProviderSubmissionIngress(this.ingressContext(), raidId, submission);
  }

  recordProviderFailure(
    raidId: string,
    providerId: string,
    failure: ProviderFailure
  ): BossRaidStatusOutput {
    return recordProviderFailureIngress(this.ingressContext(), raidId, providerId, failure);
  }

  async replayEvaluation(raidId: string): Promise<BossRaidReplayOutput> {
    return replayEvaluationQuery(
      {
        ...this.queriesContext(),
        refreshRaidAncestry: (raidId) => this.refreshRaidAncestry(raidId),
      },
      raidId
    );
  }

  abortRaid(raidId: string): BossRaidStatusOutput {
    return abortRaidIngress(this.ingressContext(), raidId);
  }

  async resumeActiveRaids(): Promise<void> {
    const activeRootRaids = this.listAllRaids()
      .filter((raid) => raid.parentRaidId == null && !TERMINAL_RAID_STATUSES.has(raid.status))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

    for (const raid of activeRootRaids) {
      await this.resumeRaid(raid.id);
    }

    await this.retryPendingSettlements();
  }

  async retryPendingSettlements(): Promise<void> {
    const pendingSettlements = this.listAllRaids()
      .filter((raid) => shouldRunSettlement(raid))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

    for (const raid of pendingSettlements) {
      try {
        await this.executeSettlement(raid.id);
      } catch (error) {
        console.error('Mercenary settlement retry failed', {
          raidId: raid.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
    pruneLaunchReservationsSpawn(this.spawnContext(), persist);
  }

  scheduleRaidDeadline(raidId: string): void {
    const raid = this.requireRaid(raidId);
    this.raidDeadlineTimers.schedule(raidId, raid, (id) => this.expireRaidAtDeadline(id));
  }

  private spawnContext(): RaidLifecycleSpawnContext {
    return {
      launchReservations: this.launchReservations,
      options: this.options,
      assertPersistenceWritable: () => this.deps.assertPersistenceWritable(),
      queuePersist: () => this.deps.queuePersist(),
      queuePersistBestEffort: () => this.deps.queuePersistBestEffort(),
      providerRegistry: this.deps.providerRegistry,
      prepareRaidDeps: () => createPrepareRaidDeps(this.runner()),
      spawnPreparedRaidDeps: () => createSpawnPreparedRaidDeps(this.runner()),
      providerCapacityDeps: () => this.deps.getProviderCapacityDeps(),
    };
  }

  private queriesContext(): RaidLifecycleQueriesContext {
    return {
      raids: this.raids,
      requireRaid: (raidId) => this.requireRaid(raidId),
      providerRegistry: this.deps.providerRegistry,
      queuePersist: () => this.deps.queuePersist(),
    };
  }

  private ingressContext(): RaidLifecycleIngressContext {
    return {
      ...this.queriesContext(),
      providerDispatchDeps: () => this.runner(),
      clearRaidDeadlineTimer: (raidId) => this.clearRaidDeadlineTimer(raidId),
      clearProviderTimers: (raidId, providerId) => this.clearProviderTimers(raidId, providerId),
      queuePersistBestEffort: () => this.deps.queuePersistBestEffort(),
    };
  }

  private async resumeRaid(raidId: string): Promise<void> {
    await resumeRaidDispatch(raidId, this.runner());
  }

  private async runRaid(raidId: string): Promise<void> {
    const raid = this.raids.get(raidId);
    if (raid) {
      const { maybePlanRaidWithVenice } = await import('./venice-planner.js');
      await maybePlanRaidWithVenice(raid);
      this.deps.queuePersistBestEffort();
    }

    await runRaidDispatch(raidId, this.runner());
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
    void finalizeRaidState(raid, this.finalizationDeps()).catch((error: unknown) => {
      console.error('Mercenary raid finalization failed', {
        raidId: raid.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
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

  private runner(): RaidRunnerContext {
    if (this.runnerContext) {
      return this.runnerContext;
    }

    const registry = this.deps.providerRegistry;
    this.runnerContext = createRaidRunnerContext({
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
    });

    return this.runnerContext;
  }

  private settlementRunnerDeps(): OrchestratorSettlementRunnerDeps {
    return {
      requireRaid: (raidId) => this.requireRaid(raidId),
      providers: this.deps.providerRegistry.providers,
      settlementOutputDir: this.deps.settlementOutputDir,
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
      adaptiveReplanDeps: () => createAdaptiveReplanDeps(this.runner()),
    };
  }
}
