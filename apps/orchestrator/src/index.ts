import { readStorageBackend } from '@bossraid/constants';
import {
  InMemoryBossRaidPersistence,
  createSecretCipher,
  type BossRaidPersistence,
  type SecretCipher,
} from '@bossraid/persistence';
import {
  createProvidersFromProfiles,
  loadProviderProfilesFromFiles,
  probeProviderHealth,
  type RaidProvider,
} from '@bossraid/provider-sdk';
import { DEFAULT_TIMEOUTS } from '@bossraid/raid-core';
import type {
  BossRaidReplayOutput,
  BossRaidResultOutput,
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  BossRaidStatusOutput,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderDiscoveryQuery,
  ProviderRegistrationInput,
  ProviderSubmission,
  BossRaidPersistenceSnapshot,
  RaidRecord,
  RaidLaunchReservationRecord,
  SettlementExecutionRecord,
  AgentHeartbeatInput,
} from '@bossraid/shared-types';
import { readRuntimeOptionsFromEnv, type RuntimeOptions } from './runtime.js';
import {
  createSettlementExecutor,
  resolveSettlementOutputDir,
  type SettlementExecuteOptions,
  type SettlementExecutor,
} from './settlement-executor.js';
import { type ProviderHealthProbe } from './provider-health-cache.js';
import { createPersistenceBackend } from './persistence-backend.js';
import { PersistenceQueue, PersistenceUnavailableError } from './persistence-queue.js';
import {
  buildOrchestratorSnapshot,
  queueOrchestratorPersist,
  queueOrchestratorPersistBestEffort,
  restoreOrchestratorState,
} from './orchestrator-persistence.js';
import {
  ProviderRegistryCoordinator,
  type ProviderRegistryCoordinatorDeps,
} from './orchestrator-provider-registry.js';
import {
  RaidLifecycleCoordinator,
  UnknownRaidError,
  type RaidLifecycleCoordinatorDeps,
} from './orchestrator-raid-lifecycle.js';
import type { OrchestratorProviderCapacityDeps } from './orchestrator-provider-capacity.js';
import { readRaidRetentionTtlMs } from './raid-retention.js';
import { findWorkspaceRoot, resolveWorkspacePath } from '@bossraid/constants/workspace';

export { InvalidRaidLaunchReservationError, NoEligibleProvidersError } from './raid-launch.js';
export { PersistenceUnavailableError } from './persistence-queue.js';
export { UnknownRaidError };

export class BossRaidOrchestrator {
  private readonly options: RuntimeOptions;
  private readonly persistence: BossRaidPersistence;
  private readonly secretCipher: SecretCipher;
  private readonly settlementExecutor: SettlementExecutor;
  private readonly persistenceQueue = new PersistenceQueue();
  private readonly raidRetentionTtlMs = readRaidRetentionTtlMs();
  private readonly providerRegistry: ProviderRegistryCoordinator;
  private readonly raidLifecycle: RaidLifecycleCoordinator;

  constructor(
    seedProviders: RaidProvider[] = [],
    options: Partial<RuntimeOptions> = {},
    persistence: BossRaidPersistence = new InMemoryBossRaidPersistence(),
    settlementExecutor: SettlementExecutor = {
      execute: async () => undefined,
      resume: async () => undefined,
    },
    providerHealthProbe: ProviderHealthProbe = probeProviderHealth
  ) {
    this.options = { ...DEFAULT_TIMEOUTS, ...options };
    this.persistence = persistence;
    this.secretCipher = createSecretCipher(process.env);
    this.settlementExecutor = settlementExecutor;

    this.providerRegistry = new ProviderRegistryCoordinator(
      this.options,
      this.providerRegistryDeps(),
      providerHealthProbe
    );
    this.raidLifecycle = new RaidLifecycleCoordinator(this.options, this.raidLifecycleDeps());

    for (const provider of seedProviders) {
      this.providerRegistry.seedProvider(provider);
    }
  }

  registerProvider(provider: RaidProvider): void {
    this.raidLifecycle.registerProvider(provider);
  }

  async upsertRegisteredProvider(input: ProviderRegistrationInput): Promise<ProviderProfile> {
    return this.raidLifecycle.upsertRegisteredProvider(input);
  }

  async recordAgentHeartbeat(input: AgentHeartbeatInput): Promise<ProviderProfile | undefined> {
    return this.raidLifecycle.recordAgentHeartbeat(input);
  }

  async discoverProviders(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    return this.raidLifecycle.discoverProviders(query);
  }

  listProviders(): ProviderProfile[] {
    return this.raidLifecycle.listProviders();
  }

  async getCachedProviderHealth(): Promise<
    import('@bossraid/shared-types').ProviderHealthStatus[]
  > {
    return Promise.all(
      this.listProviders().map((provider) =>
        this.providerRegistry.providerHealthCache.read(provider)
      )
    );
  }

  async retryPendingSettlements(): Promise<void> {
    await this.raidLifecycle.retryPendingSettlements();
  }

  getProviderProfile(providerId: string): ProviderProfile | undefined {
    return this.raidLifecycle.getProviderProfile(providerId);
  }

  listRaids(): RaidRecord[] {
    return this.raidLifecycle.listRaids();
  }

  async preflightRaid(input: BossRaidSpawnInput): Promise<void> {
    return this.raidLifecycle.preflightRaid(input);
  }

  async reserveRaidLaunch(
    input: BossRaidSpawnInput,
    options: { route: 'raid' | 'chat' | 'inference'; requestKey: string; holdUntilUnix?: number }
  ): Promise<RaidLaunchReservationRecord> {
    return this.raidLifecycle.reserveRaidLaunch(input, options);
  }

  getRaidLaunchReservation(
    reservationId: string,
    requestKey: string
  ): RaidLaunchReservationRecord | undefined {
    return this.raidLifecycle.getRaidLaunchReservation(reservationId, requestKey);
  }

  async spawnReservedRaid(
    reservationId: string,
    requestKey: string,
    escrowFundingUsd?: number,
    platformMarkupUsd?: number
  ): Promise<BossRaidSpawnOutput> {
    return this.raidLifecycle.spawnReservedRaid(
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
    return this.raidLifecycle.spawnRaid(input, escrowFundingUsd, platformMarkupUsd);
  }

  getRaid(raidId: string): RaidRecord | undefined {
    return this.raidLifecycle.getRaid(raidId);
  }

  async updateSettlementExecution(
    raidId: string,
    settlementExecution: SettlementExecutionRecord
  ): Promise<SettlementExecutionRecord | undefined> {
    return this.raidLifecycle.updateSettlementExecution(raidId, settlementExecution);
  }

  getPersistenceStatus(): { healthy: boolean; lastError?: string } {
    return this.persistenceQueue.getHealth();
  }

  restoreState(snapshot: BossRaidPersistenceSnapshot): boolean {
    return restoreOrchestratorState({
      snapshot,
      secretCipher: this.secretCipher,
      providerRegistryMaps: () => this.providerRegistry.providerRegistryMaps(),
      registerProvider: (provider) => this.providerRegistry.registerProvider(provider),
      raids: this.raidLifecycle.raids,
      launchReservations: this.raidLifecycle.launchReservations,
      listAllRaids: () => this.raidLifecycle.listAllRaids(),
      requireRaid: (raidId) => this.raidLifecycle.requireRaid(raidId),
      scheduleRaidDeadline: (raidId) => this.raidLifecycle.scheduleRaidDeadline(raidId),
      pruneLaunchReservations: (persist) => this.raidLifecycle.pruneLaunchReservations(persist),
      refreshProviderLiveness: (nowMs) => this.providerRegistry.refreshProviderLiveness(nowMs),
    });
  }

  async persistState(): Promise<void> {
    await this.queuePersist();
  }

  async resumeActiveRaids(): Promise<void> {
    await this.raidLifecycle.resumeActiveRaids();
  }

  getStatus(raidId: string): BossRaidStatusOutput {
    return this.raidLifecycle.getStatus(raidId);
  }

  getResult(raidId: string): BossRaidResultOutput {
    return this.raidLifecycle.getResult(raidId);
  }

  attachRaidPaymentProof(
    raidId: string,
    paymentProof: import('@bossraid/shared-types').RaidPaymentProof
  ): void {
    this.raidLifecycle.attachRaidPaymentProof(raidId, paymentProof);
  }

  recordProviderHeartbeat(
    raidId: string,
    providerId: string,
    heartbeat: ProviderHeartbeat
  ): BossRaidStatusOutput {
    return this.raidLifecycle.recordProviderHeartbeat(raidId, providerId, heartbeat);
  }

  async recordProviderSubmission(
    raidId: string,
    submission: ProviderSubmission
  ): Promise<BossRaidResultOutput> {
    return this.raidLifecycle.recordProviderSubmission(raidId, submission);
  }

  recordProviderFailure(
    raidId: string,
    providerId: string,
    failure: ProviderFailure
  ): BossRaidStatusOutput {
    return this.raidLifecycle.recordProviderFailure(raidId, providerId, failure);
  }

  async replayEvaluation(raidId: string): Promise<BossRaidReplayOutput> {
    return this.raidLifecycle.replayEvaluation(raidId);
  }

  abortRaid(raidId: string): BossRaidStatusOutput {
    return this.raidLifecycle.abortRaid(raidId);
  }

  private snapshotState(): BossRaidPersistenceSnapshot {
    return buildOrchestratorSnapshot({
      listAllRaids: () => this.raidLifecycle.listAllRaids(),
      listProviders: () => this.providerRegistry.listProviders(),
      launchReservations: this.raidLifecycle.launchReservations,
      secretCipher: this.secretCipher,
      refreshProviderLiveness: (nowMs) => this.providerRegistry.refreshProviderLiveness(nowMs),
      pruneLaunchReservations: (persist) => this.raidLifecycle.pruneLaunchReservations(persist),
      raidRetentionTtlMs: this.raidRetentionTtlMs,
      dropRaids: (raidIds) => {
        for (const raidId of raidIds) {
          this.raidLifecycle.raids.delete(raidId);
        }
      },
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

  private providerCapacityDeps(): OrchestratorProviderCapacityDeps {
    return {
      raids: this.raidLifecycle.raids,
      launchReservations: this.raidLifecycle.launchReservations,
      providers: this.providerRegistry.providers,
      listProviders: () => this.providerRegistry.listProviders(),
      refreshProviderAvailability: () => this.providerRegistry.refreshProviderAvailability(),
      options: this.options,
    };
  }

  private providerRegistryDeps(): ProviderRegistryCoordinatorDeps {
    return {
      assertPersistenceWritable: () => this.assertPersistenceWritable(),
      queuePersist: () => this.queuePersist(),
      getProviderCapacityDeps: () => this.providerCapacityDeps(),
    };
  }

  private raidLifecycleDeps(): RaidLifecycleCoordinatorDeps {
    const workspaceRoot = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
    return {
      assertPersistenceWritable: () => this.assertPersistenceWritable(),
      queuePersist: () => this.queuePersist(),
      queuePersistBestEffort: () => this.queuePersistBestEffort(),
      providerRegistry: this.providerRegistry,
      settlementOutputDir: resolveSettlementOutputDir(
        workspaceRoot,
        process.env.BOSSRAID_SETTLEMENT_DIR
      ),
      settlementExecutor: this.settlementExecutor,
    };
  }
}

export async function createDefaultOrchestrator(
  options: Partial<RuntimeOptions> = {}
): Promise<BossRaidOrchestrator> {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const sqliteFile = resolveWorkspacePath(
    process.env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
    workspaceCwd
  );
  const providersFileSetting = process.env.BOSSRAID_PROVIDERS_FILE;
  const providerFiles = (providersFileSetting ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolveWorkspacePath(entry, workspaceCwd))
    .filter((entry): entry is string => Boolean(entry));
  const storageBackend = readStorageBackend(process.env, { strict: true });

  const persistence = createPersistenceBackend({
    storageBackend,
    sqliteFile,
  });
  const snapshot = await persistence.loadState();

  if (providerFiles.length === 0) {
    throw new Error(
      'BOSSRAID_PROVIDERS_FILE is required. Mercenary no longer boots with simulated providers.'
    );
  }

  const profiles = await loadProviderProfilesFromFiles(providerFiles);
  if (profiles.length === 0) {
    throw new Error(
      `No providers found in ${providerFiles.join(', ')}. Configure at least one HTTP provider.`
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
  const settlementRetryMs = Number(process.env.BOSSRAID_SETTLEMENT_RETRY_INTERVAL_MS ?? '60000');
  if (Number.isFinite(settlementRetryMs) && settlementRetryMs > 0) {
    setInterval(() => {
      void orchestrator.retryPendingSettlements().catch((error: unknown) => {
        console.error('Mercenary settlement retry worker failed', error);
      });
    }, settlementRetryMs).unref?.();
  }
  return orchestrator;
}

export function runtimeOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Partial<RuntimeOptions> {
  return readRuntimeOptionsFromEnv(env);
}
