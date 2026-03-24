import { createHash, randomBytes } from "node:crypto";
import { evaluateSubmission } from "@bossraid/evaluation";
import { FileBossRaidPersistence, InMemoryBossRaidPersistence, type BossRaidPersistence } from "@bossraid/persistence";
import { SqliteBossRaidPersistence } from "@bossraid/persistence-sqlite";
import {
  buildProviderProfileFromRegistration,
  createProviderFromProfile,
  createProvidersFromProfiles,
  loadProviderProfilesFromFile,
  probeProviderHealth,
  type RaidProvider,
} from "@bossraid/provider-sdk";
import {
  DEFAULT_TIMEOUTS,
  annotateRoutingProof,
  buildRoutingProof,
  createRaidRecord,
  rankSubmissions,
  sanitizeTask,
  selectProviders,
} from "@bossraid/raid-core";
import {
  buildDiscoveryQueryFromTask,
  providerHeartbeatAgeMs,
  providerIsFresh,
  providerMatchesDiscoveryQuery,
  refreshProviderScores,
} from "@bossraid/provider-registry";
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
  ProviderTaskPackage,
  ProviderSubmission,
  BossRaidPersistenceSnapshot,
  RaidRecord,
  RaidLaunchReservationRecord,
  RaidContributionPlan,
  RankedSubmission,
  ReputationEventType,
  ReservedRaidNode,
  ReservedSelectedProviders,
  SanitizedTaskSpec,
  SelectedProviders,
  SettlementExecutionRecord,
} from "@bossraid/shared-types";
import {
  applyReputationEventToProvider,
  createProviderReputationEvent,
  hasRaidVolumeEventForProvider,
  RAID_VOLUME_EVENT_TYPES,
} from "./reputation.js";
import {
  buildAdaptivePlanningOutput,
  applyDisqualificationToRaid,
  applyFailureToRaid,
  applyHeartbeatToRaid,
  applySubmissionToRaid,
  applyTimeoutToRaid,
  buildRaidStatusOutput,
  finalizeRaidRecord,
  promoteReserveProvider,
  restorePersistedRaid,
  shouldFinalizeRaid,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from "./raid-state.js";
import {
  delay,
  readRuntimeOptionsFromEnv,
  timeoutReject,
  type RuntimeOptions,
} from "./runtime.js";
import { createSettlementExecutor } from "./settlement-executor.js";
import { buildSettlementSummary } from "./settlement.js";
import { buildSynthesizedOutput } from "./synthesis.js";
import { buildProviderTaskPackage } from "./task-package.js";
import {
  buildContributionFamilyRaidGraph,
  buildHierarchicalRaidGraph,
  type PlannedRaidNode,
  shouldUseHierarchicalPlanning,
} from "./hierarchy.js";
import {
  getContributionWorkstreamTemplate,
  type ContributionFamilyId,
} from "./partition.js";
import { ProviderTimerRegistry } from "./timer-registry.js";
import { findWorkspaceRoot, resolveWorkspacePath } from "./workspace.js";

export class NoEligibleProvidersError extends Error {
  constructor() {
    super("No eligible providers are currently available for this raid request.");
    this.name = "NoEligibleProvidersError";
  }
}

export class UnknownRaidError extends Error {
  constructor(raidId: string) {
    super(`Unknown raid: ${raidId}`);
    this.name = "UnknownRaidError";
  }
}

export class InvalidRaidLaunchReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRaidLaunchReservationError";
  }
}

type ProviderHealthProbe = typeof probeProviderHealth;

type PreparedLeafRaid = {
  mode: "single";
  sanitized: SanitizedTaskSpec;
  selectedProviders: SelectedProviders;
};

type PreparedHierarchicalRaid = {
  mode: "hierarchical";
  sanitized: SanitizedTaskSpec;
  graph: PreparedRaidNode;
  adaptiveProviderIds: string[];
};

type PreparedRaidNode = PlannedRaidNode & {
  selectedProviders?: SelectedProviders;
  children?: PreparedRaidNode[];
};

type LaunchReservationOptions = {
  route: "raid" | "chat";
  requestKey: string;
  holdUntilUnix?: number;
};

type AdaptiveReplanTarget = {
  strategy: "expand" | "repair";
  parentRaid: RaidRecord;
  sourceRaid: RaidRecord;
  workstreamId: string;
  workstreamLabel: string;
  reason: string;
  expertCount: number;
  childFamilyId?: ContributionFamilyId;
};

type AdaptiveTargetGroup = {
  parentRaid: RaidRecord;
  workstreamId: string;
  workstreamLabel: string;
  children: RaidRecord[];
  depth: number;
};

function createRaidAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashRaidAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function settlementExecutionEquals(
  left: SettlementExecutionRecord | undefined,
  right: SettlementExecutionRecord | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export class BossRaidOrchestrator {
  private readonly providers = new Map<string, ProviderProfile>();
  private readonly providerRuntimes = new Map<string, RaidProvider>();
  private readonly raids = new Map<string, RaidRecord>();
  private readonly launchReservations = new Map<string, RaidLaunchReservationRecord>();
  private readonly timers = new ProviderTimerRegistry();
  private readonly raidDeadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly expiringRaids = new Set<string>();
  private readonly options: RuntimeOptions;
  private readonly persistence: BossRaidPersistence;
  private readonly settlementExecutor: {
    execute(raid: RaidRecord): Promise<import("@bossraid/shared-types").SettlementExecutionRecord | undefined>;
  };
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    seedProviders: RaidProvider[] = [],
    options: Partial<RuntimeOptions> = {},
    persistence: BossRaidPersistence = new InMemoryBossRaidPersistence(),
    settlementExecutor: {
      execute(raid: RaidRecord): Promise<import("@bossraid/shared-types").SettlementExecutionRecord | undefined>;
    } = { execute: async () => undefined },
    private readonly providerHealthProbe: ProviderHealthProbe = probeProviderHealth,
  ) {
    this.options = { ...DEFAULT_TIMEOUTS, ...options };
    this.persistence = persistence;
    this.settlementExecutor = settlementExecutor;
    for (const provider of seedProviders) {
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: RaidProvider): void {
    refreshProviderScores(provider.profile);
    this.providers.set(provider.profile.providerId, provider.profile);
    this.providerRuntimes.set(provider.profile.providerId, provider);
  }

  upsertRegisteredProvider(input: ProviderRegistrationInput): ProviderProfile {
    const existing =
      this.providers.get(input.agentId) ??
      [...this.providers.values()].find((provider) => provider.agentId === input.agentId);
    const profile = buildProviderProfileFromRegistration(input, existing);
    profile.status = "available";
    profile.lastSeenAt = new Date().toISOString();

    this.registerProvider(createProviderFromProfile(profile));
    void this.queuePersist();
    return profile;
  }

  recordAgentHeartbeat(input: AgentHeartbeatInput): ProviderProfile | undefined {
    this.refreshProviderLiveness();
    const provider =
      this.providers.get(input.agentId) ??
      [...this.providers.values()].find((profile) => profile.agentId === input.agentId);

    if (!provider) {
      return undefined;
    }

    provider.status = input.status ?? "available";
    provider.lastSeenAt = input.timestamp ?? new Date().toISOString();
    refreshProviderScores(provider);
    void this.queuePersist();
    return provider;
  }

  async discoverProviders(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    await this.refreshProviderAvailability();
    return this.filterDiscoverableProviders(query);
  }

  private filterDiscoverableProviders(query: ProviderDiscoveryQuery = {}): ProviderProfile[] {
    this.refreshProviderLiveness();
    return this.listProviders()
      .filter((provider) => this.providerHasCapacity(provider.providerId))
      .filter((provider) => providerMatchesDiscoveryQuery(provider, query, this.options.providerFreshMs));
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
    await this.prepareRaid(input);
  }

  async reserveRaidLaunch(
    input: BossRaidSpawnInput,
    options: LaunchReservationOptions,
  ): Promise<RaidLaunchReservationRecord> {
    this.pruneLaunchReservations();
    const existing = this.findReusableLaunchReservation(options.route, options.requestKey);
    if (existing) {
      return existing;
    }

    const prepared = await this.prepareRaid(input);
    const deadlineUnix = this.computeRootDeadlineUnix(prepared.sanitized);
    const holdUntilUnix = Math.min(
      options.holdUntilUnix ?? deadlineUnix,
      deadlineUnix,
    );
    const record = this.createLaunchReservationRecord(prepared, {
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
    requestKey: string,
  ): RaidLaunchReservationRecord | undefined {
    this.pruneLaunchReservations();
    const reservation = this.launchReservations.get(reservationId);
    if (!reservation) {
      return undefined;
    }
    if (reservation.requestKey !== requestKey) {
      return undefined;
    }
    if (!reservation.spawnOutput && this.launchReservationExpired(reservation)) {
      this.launchReservations.delete(reservation.id);
      void this.queuePersist();
      return undefined;
    }
    return reservation;
  }

  async spawnReservedRaid(
    reservationId: string,
    requestKey: string,
  ): Promise<BossRaidSpawnOutput> {
    const reservation = this.getRaidLaunchReservation(reservationId, requestKey);
    if (!reservation) {
      throw new InvalidRaidLaunchReservationError(
        "Raid launch reservation is missing, expired, or does not match this request.",
      );
    }

    if (reservation.spawnOutput) {
      return reservation.spawnOutput;
    }

    if (reservation.deadlineUnix * 1_000 <= Date.now()) {
      this.launchReservations.delete(reservation.id);
      await this.queuePersist();
      throw new InvalidRaidLaunchReservationError("Raid launch reservation expired before payment completed.");
    }

    const prepared = this.hydrateLaunchReservation(reservation);
    const spawn = this.spawnPreparedRaid(prepared, reservation.deadlineUnix);
    reservation.spawnOutput = spawn;
    await this.queuePersist();
    return spawn;
  }

  async spawnRaid(input: BossRaidSpawnInput): Promise<BossRaidSpawnOutput> {
    const prepared = await this.prepareRaid(input);
    return this.spawnPreparedRaid(prepared, this.computeRootDeadlineUnix(prepared.sanitized));
  }

  private spawnPreparedRaid(
    prepared: PreparedLeafRaid | PreparedHierarchicalRaid,
    deadlineUnix: number,
  ): BossRaidSpawnOutput {
    const raidAccessToken = createRaidAccessToken();

    if (prepared.mode === "hierarchical") {
      const raid = createRaidRecord(prepared.sanitized, { primaries: [], reserves: [] }, { deadlineUnix });
      raid.status = "sanitizing";
      raid.planningMode = "hierarchical_parent";
      raid.childRaidIds = [];
      raid.adaptivePlanning =
        prepared.adaptiveProviderIds.length === 0
          ? undefined
          : {
              availableProviderIds: [...prepared.adaptiveProviderIds],
              plannedReserveExperts: prepared.adaptiveProviderIds.length,
              revisionCount: 0,
              maxRevisions: prepared.adaptiveProviderIds.length,
              spawnedChildRaidIds: [],
              history: [],
            };
      raid.raidAccessTokenHash = hashRaidAccessToken(raidAccessToken);
      this.raids.set(raid.id, raid);
      this.scheduleRaidDeadline(raid.id);
      this.instantiatePreparedChildren(raid.id, prepared.graph.children ?? [], deadlineUnix);

      void this.queuePersist();
      void this.runRaid(raid.id);

      return {
        raidId: raid.id,
        raidAccessToken,
        receiptPath: `/receipt?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
        status: raid.status,
        selectedExperts: this.countPreparedExperts(prepared.graph, "selected"),
        reserveExperts: this.countPreparedExperts(prepared.graph, "reserve") + prepared.adaptiveProviderIds.length,
        estimatedFirstResultSec: Math.min(25, prepared.sanitized.constraints.maxLatencySec),
        sanitization: prepared.sanitized.sanitizationReport,
      };
    }

    const raid = createRaidRecord(prepared.sanitized, prepared.selectedProviders, { deadlineUnix });
    raid.status = "sanitizing";
    raid.planningMode = "single_raid";
    raid.raidAccessTokenHash = hashRaidAccessToken(raidAccessToken);
    this.raids.set(raid.id, raid);
    this.scheduleRaidDeadline(raid.id);
    void this.queuePersist();
    void this.runRaid(raid.id);

    return {
      raidId: raid.id,
      raidAccessToken,
      receiptPath: `/receipt?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
      status: raid.status,
      selectedExperts: prepared.selectedProviders.primaries.length,
      reserveExperts: prepared.selectedProviders.reserves.length,
      estimatedFirstResultSec: Math.min(25, prepared.sanitized.constraints.maxLatencySec),
      sanitization: prepared.sanitized.sanitizationReport,
    };
  }

  private computeRootDeadlineUnix(task: SanitizedTaskSpec): number {
    return Math.ceil(
      (Date.now() + Math.min(this.options.raidAbsoluteMs, task.constraints.maxLatencySec * 1_000)) / 1_000,
    );
  }

  private findReusableLaunchReservation(
    route: RaidLaunchReservationRecord["route"],
    requestKey: string,
  ): RaidLaunchReservationRecord | undefined {
    return [...this.launchReservations.values()].find(
      (reservation) =>
        reservation.route === route &&
        reservation.requestKey === requestKey &&
        reservation.spawnOutput == null &&
        !this.launchReservationExpired(reservation),
    );
  }

  private createLaunchReservationRecord(
    prepared: PreparedLeafRaid | PreparedHierarchicalRaid,
    options: {
      route: RaidLaunchReservationRecord["route"];
      requestKey: string;
      deadlineUnix: number;
      holdUntilUnix: number;
    },
  ): RaidLaunchReservationRecord {
    const reservedProviderIds = [
      ...new Set(
        prepared.mode === "hierarchical"
          ? [...this.collectPreparedProviderIds(prepared.graph), ...prepared.adaptiveProviderIds]
          : [
              ...prepared.selectedProviders.primaries.map((provider) => provider.providerId),
              ...prepared.selectedProviders.reserves.map((provider) => provider.providerId),
            ],
      ),
    ];

    return {
      id: `reservation_${randomBytes(12).toString("hex")}`,
      route: options.route,
      requestKey: options.requestKey,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(options.holdUntilUnix * 1_000).toISOString(),
      deadlineUnix: options.deadlineUnix,
      mode: prepared.mode,
      sanitized: prepared.sanitized,
      selectedProviders:
        prepared.mode === "single"
          ? this.toReservedSelectedProviders(prepared.selectedProviders)
          : undefined,
      graph:
        prepared.mode === "hierarchical"
          ? this.toReservedRaidNode(prepared.graph)
          : undefined,
      adaptiveProviderIds:
        prepared.mode === "hierarchical" ? [...prepared.adaptiveProviderIds] : undefined,
      reservedProviderIds,
    };
  }

  private hydrateLaunchReservation(
    reservation: RaidLaunchReservationRecord,
  ): PreparedLeafRaid | PreparedHierarchicalRaid {
    if (reservation.mode === "single") {
      if (!reservation.selectedProviders) {
        throw new InvalidRaidLaunchReservationError(
          `Raid launch reservation ${reservation.id} is missing its selected provider set.`,
        );
      }

      return {
        mode: "single",
        sanitized: reservation.sanitized,
        selectedProviders: this.fromReservedSelectedProviders(reservation.selectedProviders),
      };
    }

    if (!reservation.graph) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} is missing its hierarchical graph.`,
      );
    }

    return {
      mode: "hierarchical",
      sanitized: reservation.sanitized,
      graph: this.fromReservedRaidNode(reservation.graph),
      adaptiveProviderIds: [...(reservation.adaptiveProviderIds ?? [])],
    };
  }

  private toReservedSelectedProviders(selectedProviders: SelectedProviders): ReservedSelectedProviders {
    return {
      primaries: selectedProviders.primaries.map((provider) => provider.providerId),
      reserves: selectedProviders.reserves.map((provider) => provider.providerId),
    };
  }

  private fromReservedSelectedProviders(selectedProviders: ReservedSelectedProviders): SelectedProviders {
    return {
      primaries: selectedProviders.primaries.map((providerId) => this.requireProvider(providerId)),
      reserves: selectedProviders.reserves.map((providerId) => this.requireProvider(providerId)),
    };
  }

  private toReservedRaidNode(node: PreparedRaidNode): ReservedRaidNode {
    return {
      task: node.task,
      contributionPlan: node.contributionPlan,
      selectedProviders: node.selectedProviders
        ? this.toReservedSelectedProviders(node.selectedProviders)
        : undefined,
      children: node.children?.map((child) => this.toReservedRaidNode(child)),
    };
  }

  private fromReservedRaidNode(node: ReservedRaidNode): PreparedRaidNode {
    return {
      task: node.task,
      contributionPlan: node.contributionPlan,
      selectedProviders: node.selectedProviders
        ? this.fromReservedSelectedProviders(node.selectedProviders)
        : undefined,
      children: node.children?.map((child) => this.fromReservedRaidNode(child)),
    };
  }

  private async prepareRaid(input: BossRaidSpawnInput): Promise<PreparedLeafRaid | PreparedHierarchicalRaid> {
    const sanitized = sanitizeTask(input);

    if (shouldUseHierarchicalPlanning(sanitized)) {
      const graph = await this.prepareHierarchicalGraph(sanitized);
      if (graph != null) {
        return {
          mode: "hierarchical",
          sanitized,
          graph: graph.graph,
          adaptiveProviderIds: graph.adaptiveProviderIds,
        };
      }
    }

    const discoverableProviders = await this.discoverProviders(buildDiscoveryQueryFromTask(sanitized));
    const selectedProviders = selectProviders(
      sanitized,
      discoverableProviders,
      this.options.providerFreshMs,
    );
    if (selectedProviders.primaries.length === 0) {
      throw new NoEligibleProvidersError();
    }

    return {
      mode: "single",
      sanitized,
      selectedProviders,
    };
  }

  private async prepareHierarchicalGraph(
    sanitized: SanitizedTaskSpec,
  ): Promise<{ graph: PreparedRaidNode; adaptiveProviderIds: string[] } | undefined> {
    const adaptiveReserveExperts = this.computeAdaptiveReserveExperts(sanitized.constraints.numExperts);
    const initialExperts = Math.max(1, sanitized.constraints.numExperts - adaptiveReserveExperts);
    const graph = buildHierarchicalRaidGraph({
      ...sanitized,
      constraints: {
        ...sanitized.constraints,
        numExperts: initialExperts,
      },
    });
    if (!graph.children?.length) {
      return undefined;
    }

    const preparedGraph = await this.assignProvidersToGraph(graph, new Set<string>(), adaptiveReserveExperts === 0);
    if (!preparedGraph) {
      return undefined;
    }

    const discoverableProviders = await this.discoverProviders(buildDiscoveryQueryFromTask(sanitized));
    const usedProviderIds = this.collectPreparedProviderIds(preparedGraph);
    const adaptiveProviderIds = discoverableProviders
      .map((provider) => provider.providerId)
      .filter((providerId) => !usedProviderIds.has(providerId))
      .slice(0, adaptiveReserveExperts);

    return {
      graph: preparedGraph,
      adaptiveProviderIds,
    };
  }

  private async assignProvidersToGraph(
    node: PlannedRaidNode,
    reservedProviderIds: Set<string>,
    includeLeafReserves: boolean,
  ): Promise<PreparedRaidNode | undefined> {
    const prepared: PreparedRaidNode = {
      task: node.task,
      contributionPlan: node.contributionPlan,
    };

    if (node.children?.length) {
      const preparedChildren: PreparedRaidNode[] = [];
      for (const child of node.children) {
        const preparedChild = await this.assignProvidersToGraph(child, reservedProviderIds, includeLeafReserves);
        if (!preparedChild) {
          return undefined;
        }
        preparedChildren.push(preparedChild);
      }
      prepared.children = preparedChildren;
      return prepared;
    }

    const discoverableProviders = await this.discoverProviders(buildDiscoveryQueryFromTask(node.task));
    const selectedProviders = selectProviders(
      node.task,
      discoverableProviders.filter((provider) => !reservedProviderIds.has(provider.providerId)),
      this.options.providerFreshMs,
    );

    if (selectedProviders.primaries.length === 0) {
      return undefined;
    }

    for (const provider of selectedProviders.primaries) {
      reservedProviderIds.add(provider.providerId);
    }

    prepared.selectedProviders = includeLeafReserves
      ? selectedProviders
      : {
          primaries: selectedProviders.primaries,
          reserves: [],
        };
    return prepared;
  }

  private computeAdaptiveReserveExperts(totalExperts: number): number {
    if (totalExperts < 6) {
      return 0;
    }

    return Math.min(4, Math.max(1, Math.floor(totalExperts / 5)));
  }

  private collectPreparedProviderIds(node: PreparedRaidNode): Set<string> {
    const providerIds = new Set<string>();

    const visit = (current: PreparedRaidNode): void => {
      for (const provider of current.selectedProviders?.primaries ?? []) {
        providerIds.add(provider.providerId);
      }
      for (const provider of current.selectedProviders?.reserves ?? []) {
        providerIds.add(provider.providerId);
      }
      for (const child of current.children ?? []) {
        visit(child);
      }
    };

    visit(node);
    return providerIds;
  }

  private instantiatePreparedChildren(
    parentRaidId: string,
    children: PreparedRaidNode[],
    deadlineUnix: number,
  ): void {
    const parentRaid = this.requireRaid(parentRaidId);
    parentRaid.childRaidIds ??= [];

    for (const child of children) {
      const childRaid = createRaidRecord(child.task, child.selectedProviders ?? { primaries: [], reserves: [] }, {
        deadlineUnix,
      });
      childRaid.planningMode = "hierarchical_child";
      childRaid.parentRaidId = parentRaidId;
      childRaid.contributionPlan = child.contributionPlan;
      childRaid.routingProof = annotateRoutingProof(
        childRaid.routingProof ?? buildRoutingProof(child.task, child.selectedProviders ?? { primaries: [], reserves: [] }),
        child.contributionPlan,
      );
      childRaid.childRaidIds = [];
      this.raids.set(childRaid.id, childRaid);
      this.scheduleRaidDeadline(childRaid.id);
      parentRaid.childRaidIds.push(childRaid.id);

      if (child.children?.length) {
        this.instantiatePreparedChildren(childRaid.id, child.children, deadlineUnix);
      }
    }
  }

  private countPreparedExperts(
    node: PreparedRaidNode,
    mode: "selected" | "reserve",
  ): number {
    if (node.children?.length) {
      return node.children.reduce((sum, child) => sum + this.countPreparedExperts(child, mode), 0);
    }

    if (!node.selectedProviders) {
      return 0;
    }

    return mode === "selected" ? node.selectedProviders.primaries.length : node.selectedProviders.reserves.length;
  }

  getRaid(raidId: string): RaidRecord | undefined {
    return this.raids.get(raidId);
  }

  async updateSettlementExecution(
    raidId: string,
    settlementExecution: SettlementExecutionRecord,
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

  restoreState(snapshot: BossRaidPersistenceSnapshot): void {
    for (const persisted of snapshot.providers) {
      const existing = this.providers.get(persisted.providerId);
      if (!existing) {
        this.registerProvider(createProviderFromProfile(persisted));
        continue;
      }

      existing.status = persisted.status;
      existing.reputation = persisted.reputation;
      existing.privacy = persisted.privacy;
      existing.modelFamily = persisted.modelFamily;
      existing.outputTypes = persisted.outputTypes;
      existing.lastSeenAt = persisted.lastSeenAt;
      refreshProviderScores(existing);
    }

    for (const raid of snapshot.raids) {
      const restored = restorePersistedRaid(raid);
      this.raids.set(restored.id, restored);
      if (!TERMINAL_RAID_STATUSES.has(restored.status)) {
        this.scheduleRaidDeadline(restored.id);
      }
    }

    for (const reservation of snapshot.launchReservations ?? []) {
      if (reservation.spawnOutput || !this.launchReservationExpired(reservation)) {
        this.launchReservations.set(reservation.id, reservation);
      }
    }

    for (const raid of this.listAllRaids()) {
      if (raid.parentRaidId == null && raid.childRaidIds?.length) {
        this.refreshParentRaidFromChildren(raid.id);
      }
    }

    this.pruneLaunchReservations();
  }

  getStatus(raidId: string): BossRaidStatusOutput {
    const raid = this.requireRaid(raidId);
    if (raid.childRaidIds?.length) {
      this.refreshParentRaidFromChildren(raidId);
      return this.buildHierarchicalRaidStatusOutput(raid);
    }
    return buildRaidStatusOutput(raid);
  }

  getResult(raidId: string): BossRaidResultOutput {
    const raid = this.requireRaid(raidId);
    if (raid.childRaidIds?.length) {
      this.refreshParentRaidFromChildren(raidId);
    }
    const ranked = raid.rankedSubmissions;
    const settlement = buildSettlementSummary(raid);
    const routingProof = this.buildRaidRoutingProofOutput(raid);

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

  private buildRaidRoutingProofOutput(raid: RaidRecord): BossRaidRoutingProof | undefined {
    if (raid.childRaidIds?.length) {
      const providers = this.collectLeafRaids(raid).flatMap(
        (childRaid) => this.buildRaidRoutingProofOutput(childRaid)?.providers ?? [],
      );

      if (providers.length === 0) {
        return undefined;
      }

      return {
        policy: raid.routingProof?.policy ?? buildRoutingProof(raid.task, { primaries: [], reserves: [] }).policy,
        providers,
      };
    }

    if (raid.routingProof) {
      return raid.contributionPlan ? annotateRoutingProof(raid.routingProof, raid.contributionPlan) : raid.routingProof;
    }

    const selectedProviders: SelectedProviders = {
      primaries: raid.selectedProviders
        .map((providerId) => this.providers.get(providerId))
        .filter((provider): provider is ProviderProfile => provider != null),
      reserves: raid.reserveProviders
        .map((providerId) => this.providers.get(providerId))
        .filter((provider): provider is ProviderProfile => provider != null),
    };

    if (selectedProviders.primaries.length === 0 && selectedProviders.reserves.length === 0) {
      return undefined;
    }

    const derived = buildRoutingProof(raid.task, selectedProviders);
    return raid.contributionPlan ? annotateRoutingProof(derived, raid.contributionPlan) : derived;
  }

  private buildHierarchicalRaidStatusOutput(raid: RaidRecord): BossRaidStatusOutput {
    const now = Date.now();
    const childRaids = this.collectLeafRaids(raid);

    return {
      raidId: raid.id,
      status: raid.status,
      experts: childRaids.flatMap((childRaid) =>
        Object.values(childRaid.assignments).map((assignment) => ({
          providerId: assignment.providerId,
          status: assignment.status,
          latencyMs: assignment.latencyMs,
          heartbeatAgeMs: assignment.lastHeartbeatAt ? now - Date.parse(assignment.lastHeartbeatAt) : undefined,
          progress: assignment.progress,
          message: childRaid.contributionPlan?.workstreamLabel
            ? `${childRaid.contributionPlan.workstreamLabel}: ${assignment.message ?? assignment.status}`
            : assignment.message,
        })),
      ),
      firstValidAvailable: Boolean(raid.firstValidSubmissionId),
      bestCurrentScore: raid.bestCurrentScore,
      adaptivePlanning: buildAdaptivePlanningOutput(raid),
      sanitization: raid.task.sanitizationReport,
    };
  }

  private refreshParentRaidFromChildren(raidId: string): void {
    const raid = this.requireRaid(raidId);
    if (!raid.childRaidIds?.length) {
      return;
    }

    const childRaids = raid.childRaidIds.map((childRaidId) => {
      const childRaid = this.requireRaid(childRaidId);
      if (childRaid.childRaidIds?.length) {
        this.refreshParentRaidFromChildren(childRaidId);
      }
      return childRaid;
    });
    const rankedSubmissions = rankSubmissions(childRaids.flatMap((childRaid) => childRaid.rankedSubmissions));
    const firstValidSubmission = rankedSubmissions.find((entry) => entry.breakdown.valid);

    raid.rankedSubmissions = rankedSubmissions;
    raid.bestCurrentScore = rankedSubmissions[0]?.breakdown.finalScore;
    raid.primarySubmissionId = firstValidSubmission?.submission.providerId;
    raid.firstValidSubmissionId = firstValidSubmission?.submission.providerId;
    raid.synthesizedOutput = buildSynthesizedOutput(raid);
    raid.updatedAt = new Date().toISOString();

    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }

    const hasDispatchingChild = childRaids.some((childRaid) =>
      ["sanitizing", "queued", "dispatching"].includes(childRaid.status),
    );
    const hasRunningChild = childRaids.some((childRaid) => ["running", "first_valid", "evaluating"].includes(childRaid.status));

    if (firstValidSubmission) {
      raid.status = "first_valid";
      return;
    }

    raid.status = hasRunningChild ? "running" : hasDispatchingChild ? "dispatching" : raid.status;
  }

  private collectLeafRaids(raid: RaidRecord): RaidRecord[] {
    if (!raid.childRaidIds?.length) {
      return [raid];
    }

    return raid.childRaidIds.flatMap((childRaidId) => this.collectLeafRaids(this.requireRaid(childRaidId)));
  }

  recordProviderHeartbeat(raidId: string, providerId: string, heartbeat: ProviderHeartbeat): BossRaidStatusOutput {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return buildRaidStatusOutput(raid);
    }
    this.markHeartbeat(raidId, providerId, heartbeat);
    return this.getStatus(raidId);
  }

  async recordProviderSubmission(raidId: string, submission: ProviderSubmission): Promise<BossRaidResultOutput> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return this.getResult(raidId);
    }
    await this.submitResult(raidId, submission);
    return this.getResult(raidId);
  }

  recordProviderFailure(raidId: string, providerId: string, failure: ProviderFailure): BossRaidStatusOutput {
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
      const leafRaids = this.collectLeafRaids(raid);
      let reEvaluated = 0;
      for (const leafRaid of leafRaids) {
        const leafResults = await Promise.all(
          leafRaid.rankedSubmissions.map(async (entry) => ({
            ...entry,
            breakdown: await evaluateSubmission(leafRaid, entry.submission),
          })),
        );
        leafRaid.rankedSubmissions = rankSubmissions(leafResults);
        leafRaid.synthesizedOutput = buildSynthesizedOutput(leafRaid);
        leafRaid.bestCurrentScore = leafRaid.rankedSubmissions[0]?.breakdown.finalScore;
        leafRaid.updatedAt = new Date().toISOString();
        reEvaluated += leafRaid.rankedSubmissions.length;
      }

      this.refreshParentRaidFromChildren(raidId);
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
      })),
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
    raid.status = "cancelled";
    raid.updatedAt = cancelledAt;
    if (raid.childRaidIds?.length) {
      for (const childRaidId of raid.childRaidIds) {
        this.abortRaid(childRaidId);
      }
    }
    for (const assignment of Object.values(raid.assignments)) {
      this.clearProviderTimers(raidId, assignment.providerId);
      if (!TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        assignment.status = "disqualified";
        assignment.message = "raid cancelled";
        assignment.timeoutAt = cancelledAt;
      }
    }
    this.queuePersist();
    return this.getStatus(raidId);
  }

  private async runRaid(raidId: string): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (this.raidDeadlineReached(raid)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }
    if (raid.childRaidIds?.length) {
      await this.runHierarchicalRaid(raidId);
      return;
    }
    raid.status = "dispatching";
    raid.updatedAt = new Date().toISOString();
    this.queuePersist();

    const runs = raid.selectedProviders.map((providerId) => this.dispatchProvider(raidId, providerId));
    await Promise.allSettled(runs);

    await this.waitForFinalization(raidId);
    const fresh = this.requireRaid(raidId);
    if (!TERMINAL_RAID_STATUSES.has(fresh.status)) {
      this.finalizeRaid(fresh);
    }
  }

  private async runHierarchicalRaid(raidId: string): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (this.raidDeadlineReached(raid)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }

    raid.status = "dispatching";
    raid.updatedAt = new Date().toISOString();
    this.queuePersist();

    const childRuns = (raid.childRaidIds ?? []).map((childRaidId) => this.runRaid(childRaidId));
    await Promise.allSettled(childRuns);

    const fresh = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(fresh.status)) {
      return;
    }
    if (this.raidDeadlineReached(fresh)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }

    this.refreshParentRaidFromChildren(raidId);
    if (this.maybeReplanHierarchicalRaid(raidId)) {
      return;
    }
    if (this.shouldFinalizeHierarchicalRaid(fresh)) {
      this.finalizeRaid(fresh);
      return;
    }

    this.queuePersist();
  }

  private async dispatchProvider(
    raidId: string,
    providerId: string,
  ): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (this.raidDeadlineReached(raid)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }
    const provider = this.providerRuntimes.get(providerId);

    if (!provider) {
      this.markAssignmentFailed(raidId, providerId, "provider runtime missing");
      return;
    }

    const taskPackage: ProviderTaskPackage = buildProviderTaskPackage(raid.id, raid.task, {
      deadlineUnix: raid.deadlineUnix,
      providerIndex: raid.contributionPlan?.providerIndex ?? Math.max(raid.selectedProviders.indexOf(providerId), 0) + 1,
      totalExperts: raid.contributionPlan?.totalExperts ?? Math.max(raid.selectedProviders.length, 1),
      providerSpecializations: provider.profile.specializations,
      contributionPlan: raid.contributionPlan,
    });

    const assignment = raid.assignments[providerId];
    assignment.contributionRole =
      taskPackage.synthesis == null
        ? undefined
        : {
            id: taskPackage.synthesis.roleId,
            label: taskPackage.synthesis.roleLabel,
            objective: taskPackage.synthesis.roleObjective,
            workstreamId: taskPackage.synthesis.workstreamId,
            workstreamLabel: taskPackage.synthesis.workstreamLabel,
            workstreamObjective: taskPackage.synthesis.workstreamObjective,
          };
    assignment.status = "invited";
    assignment.invitedAt = new Date().toISOString();
    assignment.message = "dispatching";
    raid.status = "running";
    raid.updatedAt = new Date().toISOString();
    this.queuePersist();

    this.clearProviderTimers(raidId, providerId);
    this.timers.setHardTimeout(raidId, providerId, this.options.hardExecutionMs, () => {
      this.markTimedOut(raidId, providerId, "hard execution timeout");
    });

    try {
      const acceptance = await Promise.race([
        provider.accept(taskPackage),
        timeoutReject(this.options.inviteAcceptMs, "invite timeout"),
      ]);

      if (!acceptance.accepted) {
        this.markTimedOut(raidId, providerId, "invite rejected");
        return;
      }

      const acceptedAt = new Date().toISOString();
      const activeRaid = this.requireRaid(raidId);
      if (TERMINAL_RAID_STATUSES.has(activeRaid.status)) {
        this.clearProviderTimers(raidId, providerId);
        return;
      }

      const activeAssignment = activeRaid.assignments[providerId];
      if (TERMINAL_ASSIGNMENT_STATUSES.has(activeAssignment.status)) {
        this.clearProviderTimers(raidId, providerId);
        return;
      }

      activeAssignment.status = "accepted";
      activeAssignment.acceptedAt = acceptedAt;
      activeAssignment.providerRunId = acceptance.providerRunId;
      activeAssignment.message = "accepted";
      const profile = this.providers.get(providerId);
      if (profile) {
        profile.status = "available";
        profile.lastSeenAt = acceptedAt;
      }
      this.queuePersist();

      this.timers.setFirstHeartbeatTimeout(raidId, providerId, this.options.firstHeartbeatMs, () => {
        const current = this.requireRaid(raidId).assignments[providerId];
        if (!current.firstHeartbeatAt && !TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
          this.markTimedOut(raidId, providerId, "first heartbeat timeout");
        }
      });

      void Promise.resolve(
        provider.run(taskPackage, {
          onHeartbeat: async (heartbeat) => {
            this.markHeartbeat(raidId, providerId, heartbeat);
          },
          onSubmit: async (submission) => {
            await this.submitResult(raidId, submission);
          },
          onFailure: async (error) => {
            this.markAssignmentFailed(raidId, providerId, error.message);
          },
        }),
      ).catch((error) => {
        this.markAssignmentFailed(
          raidId,
          providerId,
          error instanceof Error ? error.message : "provider run failed",
        );
      });
    } catch (error) {
      this.markTimedOut(
        raidId,
        providerId,
        error instanceof Error ? error.message : "provider dispatch failed",
      );
    }
  }

  private markHeartbeat(raidId: string, providerId: string, heartbeat: ProviderHeartbeat): void {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (!applyHeartbeatToRaid(raid, providerId, heartbeat)) {
      return;
    }
    this.timers.clearFirstHeartbeat(raidId, providerId);
    this.timers.setHeartbeatStaleTimeout(raidId, providerId, this.options.heartbeatStaleMs, () => {
      const current = this.requireRaid(raidId).assignments[providerId];
      if (!TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
        this.markTimedOut(raidId, providerId, "heartbeat stale");
      }
    });
    const profile = this.providers.get(providerId);
    if (profile) {
      profile.status = "available";
      profile.lastSeenAt = heartbeat.timestamp;
    }
    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
    }
    this.queuePersist();
  }

  private async submitResult(raidId: string, submission: ProviderSubmission): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    const assignment = raid.assignments[submission.providerId];
    const normalizedSubmission =
      submission.contributionRole == null && assignment?.contributionRole != null
        ? {
            ...submission,
            contributionRole: assignment.contributionRole,
          }
        : submission;
    const breakdown = await evaluateSubmission(raid, normalizedSubmission);

    this.clearProviderTimers(raidId, submission.providerId);
    applySubmissionToRaid(raid, normalizedSubmission, breakdown);

    this.applyReputationEvent(
      submission.providerId,
      breakdown.valid ? "valid_submission" : "invalid_submission",
      { raidId, finalScore: breakdown.finalScore },
    );

    if (breakdown.invalidReasons.includes("duplicate_submission")) {
      this.applyReputationEvent(submission.providerId, "duplicate_submission", { raidId });
    }

    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
    this.maybeFinalizeAfterUpdate(raidId);
    this.queuePersist();
  }

  private markTimedOut(raidId: string, providerId: string, reason: string): void {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (!applyTimeoutToRaid(raid, providerId, reason)) {
      return;
    }

    this.clearProviderTimers(raidId, providerId);
    this.applyReputationEvent(
      providerId,
      reason.includes("invite") ? "invite_timeout" : "heartbeat_timeout",
      { raidId, reason },
    );
    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
    this.promoteReserve(raidId);
    this.maybeFinalizeAfterUpdate(raidId);
    this.queuePersist();
  }

  private markAssignmentFailed(raidId: string, providerId: string, reason: string): void {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    if (!applyFailureToRaid(raid, providerId, reason)) {
      return;
    }

    this.clearProviderTimers(raidId, providerId);
    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
    this.promoteReserve(raidId);
    this.maybeFinalizeAfterUpdate(raidId);
    this.queuePersist();
  }

  private expireRaidAtDeadline(raidId: string): void {
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status) || this.expiringRaids.has(raidId)) {
      return;
    }
    this.expiringRaids.add(raidId);
    this.clearRaidDeadlineTimer(raidId);

    try {
      const reason = "raid deadline reached before completion";
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
          assignment.acceptedAt ? "heartbeat_timeout" : "invite_timeout",
          { raidId, reason },
        );
      }

      if (raid.parentRaidId) {
        this.refreshRaidAncestry(raid.parentRaidId);
        this.maybeFinalizeAfterUpdate(raid.parentRaidId);
      }
      this.queuePersist();
      this.finalizeRaid(raid);
    } finally {
      this.expiringRaids.delete(raidId);
    }
  }

  private promoteReserve(raidId: string): void {
    const raid = this.requireRaid(raidId);
    const nextReserveId = promoteReserveProvider(raid);
    if (!nextReserveId) {
      return;
    }
    if (raid.routingProof) {
      raid.routingProof.providers = raid.routingProof.providers.map((decision) =>
        decision.providerId !== nextReserveId || decision.phase !== "reserve"
          ? decision
          : {
              ...decision,
              phase: "primary",
              reasons: decision.reasons.includes("promoted_from_reserve")
                ? decision.reasons.filter((reason) => reason !== "reserved_fallback")
                : [...decision.reasons.filter((reason) => reason !== "reserved_fallback"), "promoted_from_reserve"],
            },
      );
    }
    this.queuePersist();
    void this.dispatchProvider(raidId, nextReserveId);
  }

  private maybeFinalizeAfterUpdate(raidId: string): void {
    const raid = this.requireRaid(raidId);
    if (this.raidDeadlineReached(raid)) {
      this.expireRaidAtDeadline(raidId);
      return;
    }
    if (raid.childRaidIds?.length) {
      this.refreshParentRaidFromChildren(raidId);
      if (raid.adaptivePlanning && this.maybeReplanHierarchicalRaid(raidId)) {
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
      TERMINAL_RAID_STATUSES.has(this.requireRaid(childRaidId).status),
    );
  }

  private maybeReplanHierarchicalRaid(raidId: string): boolean {
    const raid = this.requireRaid(raidId);
    const adaptivePlanning = raid.adaptivePlanning;
    if (
      !raid.childRaidIds?.length ||
      !adaptivePlanning ||
      adaptivePlanning.availableProviderIds.length === 0 ||
      adaptivePlanning.revisionCount >= adaptivePlanning.maxRevisions ||
      TERMINAL_RAID_STATUSES.has(raid.status) ||
      this.raidDeadlineReached(raid)
    ) {
      return false;
    }

    const target = this.selectAdaptiveReplanTarget(raid);
    if (!target) {
      return false;
    }

    const providers = this.takeAdaptiveProviders(adaptivePlanning, target.expertCount);
    if (providers.length === 0) {
      return false;
    }

    const actualStrategy =
      target.strategy === "expand" && target.childFamilyId && providers.length > 1 ? "expand" : "repair";
    const spawnedRaid =
      actualStrategy === "expand"
        ? this.spawnAdaptiveExpansionRaid(target.parentRaid, target, target.childFamilyId!, providers)
        : this.spawnAdaptiveRepairRaid(target.parentRaid, target, providers[0]!);

    const createdAt = new Date().toISOString();
    adaptivePlanning.revisionCount += 1;
    adaptivePlanning.spawnedChildRaidIds.push(spawnedRaid.id);
    adaptivePlanning.history.push({
      targetRaidId: target.sourceRaid.id,
      targetParentRaidId: target.parentRaid.id,
      workstreamId: target.workstreamId,
      workstreamLabel: target.workstreamLabel,
      strategy: actualStrategy,
      reason: target.reason,
      spawnedRaidIds: [spawnedRaid.id],
      createdAt,
    });
    raid.status = "dispatching";
    raid.updatedAt = createdAt;
    this.queuePersist();
    void this.runRaid(spawnedRaid.id);
    return true;
  }

  private selectAdaptiveReplanTarget(raid: RaidRecord): AdaptiveReplanTarget | undefined {
    const adaptivePlanning = raid.adaptivePlanning;
    if (!adaptivePlanning) {
      return undefined;
    }

    const candidates = this.collectAdaptiveTargetGroups(raid).flatMap((group) => {
      if (group.children.some((child) => !TERMINAL_RAID_STATUSES.has(child.status))) {
        return [];
      }

      const revisionCount = this.countAdaptiveRevisions(raid, group.parentRaid.id, group.workstreamId);
      if (revisionCount >= 2) {
        return [];
      }

      const validChildren = group.children.filter((child) => this.raidHasValidOutput(child));
      const sourceRaid =
        [...(validChildren.length > 0 ? validChildren : group.children)].sort(
          (left, right) => (right.bestCurrentScore ?? 0) - (left.bestCurrentScore ?? 0),
        )[0];

      if (!sourceRaid?.contributionPlan) {
        return [];
      }

      const template = getContributionWorkstreamTemplate(sourceRaid.task, sourceRaid.contributionPlan.workstreamId);
      const expansionCount = this.computeAdaptiveExpansionExperts(
        adaptivePlanning.availableProviderIds.length,
        validChildren.length === 0 ? "missing" : "weak",
      );
      const canExpand =
        template?.childFamilyId != null &&
        expansionCount >= 2 &&
        this.countAdaptiveRevisions(raid, group.parentRaid.id, group.workstreamId, "expand") === 0;

      const candidatesForGroup: Array<AdaptiveReplanTarget & { priority: number; depth: number; bestScore: number }> = [];

      if (validChildren.length === 0) {
        candidatesForGroup.push({
          strategy: canExpand ? "expand" : "repair",
          parentRaid: group.parentRaid,
          sourceRaid,
          workstreamId: group.workstreamId,
          workstreamLabel: group.workstreamLabel,
          reason: this.summarizeAdaptiveGap(group.children),
          expertCount: canExpand ? expansionCount : 1,
          childFamilyId: canExpand ? template?.childFamilyId : undefined,
          priority: 0,
          depth: group.depth,
          bestScore: 0,
        });
      }

      const bestScore = Math.max(...group.children.map((child) => child.bestCurrentScore ?? 0), 0);
      if (validChildren.length > 0 && bestScore < 0.72) {
        candidatesForGroup.push({
          strategy: canExpand ? "expand" : "repair",
          parentRaid: group.parentRaid,
          sourceRaid,
          workstreamId: group.workstreamId,
          workstreamLabel: group.workstreamLabel,
          reason: `Best ${group.workstreamLabel.toLowerCase()} score remained weak at ${bestScore.toFixed(2)}.`,
          expertCount: canExpand ? expansionCount : 1,
          childFamilyId: canExpand ? template?.childFamilyId : undefined,
          priority: this.isPriorityAdaptiveGroup(group.parentRaid, group.workstreamId) ? 1 : 2,
          depth: group.depth,
          bestScore,
        });
      }

      return candidatesForGroup;
    });

    const next = candidates.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      if (left.depth !== right.depth) {
        return right.depth - left.depth;
      }
      return left.bestScore - right.bestScore;
    })[0];

    if (!next) {
      return undefined;
    }

    return {
      strategy: next.strategy,
      parentRaid: next.parentRaid,
      sourceRaid: next.sourceRaid,
      workstreamId: next.workstreamId,
      workstreamLabel: next.workstreamLabel,
      reason: next.reason,
      expertCount: next.expertCount,
      childFamilyId: next.childFamilyId,
    };
  }

  private collectAdaptiveTargetGroups(raid: RaidRecord): AdaptiveTargetGroup[] {
    const groups: AdaptiveTargetGroup[] = [];
    const visit = (parentRaid: RaidRecord, depth: number): void => {
      if (!parentRaid.childRaidIds?.length) {
        return;
      }

      for (const group of this.groupDirectChildRaidsByWorkstream(parentRaid)) {
        groups.push({
          parentRaid,
          workstreamId: group.workstreamId,
          workstreamLabel: group.workstreamLabel,
          children: group.children,
          depth,
        });
      }

      for (const childRaidId of parentRaid.childRaidIds) {
        visit(this.requireRaid(childRaidId), depth + 1);
      }
    };

    visit(raid, 0);
    return groups;
  }

  private countAdaptiveRevisions(
    raid: RaidRecord,
    parentRaidId: string,
    workstreamId: string,
    strategy?: "expand" | "repair",
  ): number {
    return (
      raid.adaptivePlanning?.history.filter((entry) =>
        entry.targetParentRaidId === parentRaidId &&
        entry.workstreamId === workstreamId &&
        (strategy == null || entry.strategy === strategy),
      ).length ?? 0
    );
  }

  private isPriorityAdaptiveGroup(parentRaid: RaidRecord, workstreamId: string): boolean {
    if (workstreamId.endsWith("-core")) {
      return true;
    }

    const primaryType = parentRaid.task.output?.primaryType ?? "patch";
    return primaryType === "patch"
      ? workstreamId === "implementation" || workstreamId.startsWith("implementation-")
      : workstreamId === "answer" || workstreamId.startsWith("answer-");
  }

  private groupDirectChildRaidsByWorkstream(raid: RaidRecord): Array<{
    workstreamId: string;
    workstreamLabel: string;
    children: RaidRecord[];
  }> {
    const groups = new Map<string, { workstreamId: string; workstreamLabel: string; children: RaidRecord[] }>();

    for (const childRaidId of raid.childRaidIds ?? []) {
      const childRaid = this.requireRaid(childRaidId);
      const workstreamId = childRaid.contributionPlan?.workstreamId ?? childRaid.id;
      const workstreamLabel = childRaid.contributionPlan?.workstreamLabel ?? childRaid.id;
      const current = groups.get(workstreamId);
      if (current) {
        current.children.push(childRaid);
        continue;
      }

      groups.set(workstreamId, {
        workstreamId,
        workstreamLabel,
        children: [childRaid],
      });
    }

    return [...groups.values()];
  }

  private summarizeAdaptiveGap(childRaids: RaidRecord[]): string {
    const invalidReasons = childRaids
      .flatMap((child) => child.rankedSubmissions.flatMap((entry) => entry.breakdown.invalidReasons))
      .slice(0, 3);
    if (invalidReasons.length > 0) {
      return `No valid output yet. Invalid signals: ${invalidReasons.join(", ")}.`;
    }

    const failureMessages = childRaids
      .flatMap((child) => Object.values(child.assignments).map((assignment) => assignment.message))
      .filter((message): message is string => Boolean(message))
      .slice(0, 2);

    return failureMessages.length > 0
      ? `No valid output yet. Latest signals: ${failureMessages.join(" | ")}.`
      : "No valid output yet for this workstream.";
  }

  private raidHasValidOutput(raid: RaidRecord): boolean {
    return raid.rankedSubmissions.some((entry) => entry.breakdown.valid);
  }

  private computeAdaptiveExpansionExperts(
    availableExperts: number,
    mode: "missing" | "weak",
  ): number {
    const cap = mode === "missing" ? 3 : 2;
    return Math.max(0, Math.min(availableExperts, cap));
  }

  private takeAdaptiveProviders(
    adaptivePlanning: NonNullable<RaidRecord["adaptivePlanning"]>,
    count: number,
  ): ProviderProfile[] {
    const providers: ProviderProfile[] = [];

    while (providers.length < count && adaptivePlanning.availableProviderIds.length > 0) {
      const providerId = adaptivePlanning.availableProviderIds.shift();
      if (!providerId) {
        continue;
      }

      const provider = this.providers.get(providerId);
      if (provider) {
        providers.push(provider);
      }
    }

    return providers;
  }

  private spawnAdaptiveExpansionRaid(
    parentRaid: RaidRecord,
    target: AdaptiveReplanTarget,
    childFamilyId: ContributionFamilyId,
    providers: ProviderProfile[],
  ): RaidRecord {
    const childTask = this.buildAdaptiveExpansionTask(target.sourceRaid.task, providers.length);
    const childRaid = createRaidRecord(childTask, {
      primaries: [],
      reserves: [],
    }, {
      deadlineUnix: parentRaid.deadlineUnix,
    });
    childRaid.planningMode = "hierarchical_child";
    childRaid.parentRaidId = parentRaid.id;
    childRaid.contributionPlan = this.buildAdaptiveExpansionPlan(target.sourceRaid, target.reason, providers.length);
    childRaid.routingProof = annotateRoutingProof(
      childRaid.routingProof ?? buildRoutingProof(childTask, { primaries: [], reserves: [] }),
      childRaid.contributionPlan,
    );
    childRaid.childRaidIds = [];
    this.raids.set(childRaid.id, childRaid);
    this.scheduleRaidDeadline(childRaid.id);

    const graph = buildContributionFamilyRaidGraph(childTask, childFamilyId, providers.length);
    const preparedChildren = this.assignAdaptiveProvidersToGraph(graph, providers, target.reason);

    this.reopenRaidAncestry(parentRaid.id);
    parentRaid.childRaidIds ??= [];
    parentRaid.childRaidIds.push(childRaid.id);
    this.instantiatePreparedChildren(childRaid.id, preparedChildren, parentRaid.deadlineUnix);
    return childRaid;
  }

  private assignAdaptiveProvidersToGraph(
    nodes: PlannedRaidNode[],
    providers: ProviderProfile[],
    reason: string,
  ): PreparedRaidNode[] {
    let providerIndex = 0;

    const assignNode = (node: PlannedRaidNode): PreparedRaidNode => {
      const prepared: PreparedRaidNode = {
        task: node.task,
        contributionPlan: this.annotateAdaptiveContributionPlan(node.contributionPlan, reason),
      };

      if (node.children?.length) {
        prepared.children = node.children.map(assignNode);
        return prepared;
      }

      const provider = providers[providerIndex];
      providerIndex += 1;
      if (!provider) {
        throw new Error("Adaptive provider allocation underflow while revising the raid graph.");
      }

      prepared.selectedProviders = {
        primaries: [provider],
        reserves: [],
      };
      return prepared;
    };

    return nodes.map(assignNode);
  }

  private annotateAdaptiveContributionPlan(
    plan: RaidContributionPlan | undefined,
    reason: string,
  ): RaidContributionPlan | undefined {
    if (!plan) {
      return undefined;
    }

    return {
      ...plan,
      prompt: [plan.prompt, reason, "Close the observed gap directly and avoid repeating the earlier miss."].join(" "),
    };
  }

  private spawnAdaptiveRepairRaid(
    parentRaid: RaidRecord,
    target: AdaptiveReplanTarget,
    provider: ProviderProfile,
  ): RaidRecord {
    const childTask = this.buildAdaptiveRepairTask(target.sourceRaid.task);
    const childRaid = createRaidRecord(childTask, {
      primaries: [provider],
      reserves: [],
    }, {
      deadlineUnix: parentRaid.deadlineUnix,
    });
    childRaid.planningMode = "hierarchical_child";
    childRaid.parentRaidId = parentRaid.id;
    childRaid.contributionPlan = this.buildAdaptiveRepairPlan(target.sourceRaid, target.reason);
    childRaid.routingProof = annotateRoutingProof(
      childRaid.routingProof ?? buildRoutingProof(childTask, { primaries: [provider], reserves: [] }),
      childRaid.contributionPlan,
    );
    childRaid.childRaidIds = [];
    this.raids.set(childRaid.id, childRaid);
    this.scheduleRaidDeadline(childRaid.id);
    this.reopenRaidAncestry(parentRaid.id);
    parentRaid.childRaidIds ??= [];
    parentRaid.childRaidIds.push(childRaid.id);
    return childRaid;
  }

  private reopenRaidAncestry(raidId: string | undefined): void {
    const reopenedAt = new Date().toISOString();
    let currentRaidId = raidId;

    while (currentRaidId) {
      const currentRaid = this.requireRaid(currentRaidId);
      if (TERMINAL_RAID_STATUSES.has(currentRaid.status)) {
        currentRaid.status = "dispatching";
      }
      currentRaid.updatedAt = reopenedAt;
      currentRaidId = currentRaid.parentRaidId;
    }
  }

  private buildAdaptiveRepairTask(task: SanitizedTaskSpec): SanitizedTaskSpec {
    const perExpertBudget = Number(
      (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2),
    );

    return {
      ...task,
      constraints: {
        ...task.constraints,
        numExperts: 1,
        maxBudgetUsd: Math.max(perExpertBudget, 0.01),
      },
    };
  }

  private buildAdaptiveExpansionTask(
    task: SanitizedTaskSpec,
    expertCount: number,
  ): SanitizedTaskSpec {
    const perExpertBudget = Number(
      (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2),
    );

    return {
      ...task,
      constraints: {
        ...task.constraints,
        numExperts: expertCount,
        maxBudgetUsd: Math.max(Number((perExpertBudget * expertCount).toFixed(2)), 0.01),
      },
    };
  }

  private buildAdaptiveExpansionPlan(
    sourceRaid: RaidRecord,
    reason: string,
    expertCount: number,
  ): RaidContributionPlan {
    const sourcePlan = sourceRaid.contributionPlan;
    if (!sourcePlan) {
      throw new Error(`Cannot build adaptive expansion plan for raid ${sourceRaid.id} without contribution metadata.`);
    }

    return {
      providerIndex: 1,
      totalExperts: expertCount,
      roleId: `${sourcePlan.roleId}-expansion`,
      roleLabel: `${sourcePlan.workstreamLabel} Expansion`,
      roleObjective: `Split ${sourcePlan.workstreamLabel} into narrower sub-workstreams and close the gap.`,
      workstreamId: sourcePlan.workstreamId,
      workstreamLabel: sourcePlan.workstreamLabel,
      workstreamObjective: sourcePlan.workstreamObjective,
      prompt: [
        sourcePlan.prompt,
        `Adaptive expansion reason: ${reason}`,
        "Break this workstream into narrower sub-workstreams and close the missing or weak coverage directly.",
      ].join(" "),
    };
  }

  private buildAdaptiveRepairPlan(sourceRaid: RaidRecord, reason: string): RaidContributionPlan {
    const sourcePlan = sourceRaid.contributionPlan;
    if (!sourcePlan) {
      throw new Error(`Cannot build adaptive repair plan for raid ${sourceRaid.id} without contribution metadata.`);
    }

    return {
      providerIndex: 1,
      totalExperts: 1,
      roleId: `${sourcePlan.roleId}-repair`,
      roleLabel: `${sourcePlan.workstreamLabel} Repair`,
      roleObjective: `Repair the missing or weak coverage for ${sourcePlan.workstreamLabel}.`,
      workstreamId: sourcePlan.workstreamId,
      workstreamLabel: sourcePlan.workstreamLabel,
      workstreamObjective: sourcePlan.workstreamObjective,
      prompt: [
        sourcePlan.prompt,
        `Previous ${sourcePlan.workstreamLabel.toLowerCase()} coverage was missing, invalid, or too weak.`,
        reason,
        "Fill the gap directly and avoid repeating the earlier failure.",
      ].join(" "),
    };
  }

  private refreshRaidAncestry(raidId: string | undefined): void {
    let currentRaidId = raidId;

    while (currentRaidId) {
      this.refreshParentRaidFromChildren(currentRaidId);
      currentRaidId = this.requireRaid(currentRaidId).parentRaidId;
    }
  }

  private finalizeRaid(raid: RaidRecord): void {
    this.clearRaidDeadlineTimer(raid.id);
    if (raid.childRaidIds?.length) {
      this.refreshParentRaidFromChildren(raid.id);
    }
    finalizeRaidRecord(raid);

    if (raid.parentRaidId == null) {
      for (const submission of raid.rankedSubmissions.filter((item) => item.breakdown.valid)) {
        this.applyReputationEvent(submission.submission.providerId, "successful_provider", {
          raidId: raid.id,
        });
      }
    }

    if (raid.parentRaidId) {
      this.refreshRaidAncestry(raid.parentRaidId);
      this.maybeFinalizeAfterUpdate(raid.parentRaidId);
    }
    this.queuePersist();
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
      await delay(250);
    }

    const raid = this.requireRaid(raidId);
    if (!TERMINAL_RAID_STATUSES.has(raid.status)) {
      this.expireRaidAtDeadline(raidId);
    }
  }

  private applyReputationEvent(
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>,
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
        !hasRaidVolumeEventForProvider(this.raids.get(String(context?.raidId ?? "")), providerId),
    );

    let currentRaidId = typeof context?.raidId === "string" ? context.raidId : undefined;
    while (currentRaidId) {
      const raid = this.raids.get(currentRaidId);
      if (!raid) {
        break;
      }
      raid.reputationEvents.push(event);
      currentRaidId = raid.parentRaidId;
    }
    this.queuePersist();
  }

  private snapshotState(): BossRaidPersistenceSnapshot {
    this.refreshProviderLiveness();
    this.pruneLaunchReservations(false);
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      raids: this.listAllRaids(),
      providers: this.listProviders(),
      launchReservations: [...this.launchReservations.values()],
    };
  }

  private queuePersist(): Promise<void> {
    this.persistenceQueue = this.persistenceQueue.then(() => this.persistence.saveState(this.snapshotState())).catch((error) => {
      console.error("Mercenary persistence error", error);
    });
    return this.persistenceQueue;
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
    this.clearRaidDeadlineTimer(raidId);
    const raid = this.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }

    const delayMs = raid.deadlineUnix * 1_000 - Date.now();
    if (delayMs <= 0) {
      queueMicrotask(() => this.expireRaidAtDeadline(raidId));
      return;
    }

    const timer = setTimeout(() => {
      this.expireRaidAtDeadline(raidId);
    }, delayMs);
    this.raidDeadlineTimers.set(raidId, timer);
  }

  private clearRaidDeadlineTimer(raidId: string): void {
    const timer = this.raidDeadlineTimers.get(raidId);
    if (timer) {
      clearTimeout(timer);
      this.raidDeadlineTimers.delete(raidId);
    }
  }

  private raidDeadlineReached(raid: RaidRecord): boolean {
    return raid.deadlineUnix * 1_000 <= Date.now();
  }

  private launchReservationExpired(reservation: RaidLaunchReservationRecord): boolean {
    return Date.parse(reservation.expiresAt) <= Date.now();
  }

  private pruneLaunchReservations(persist = true): void {
    const nowMs = Date.now();
    let changed = false;

    for (const [reservationId, reservation] of this.launchReservations.entries()) {
      const staleReplay =
        reservation.spawnOutput != null &&
        Date.parse(reservation.createdAt) + 15 * 60_000 <= nowMs;
      const expired =
        reservation.spawnOutput == null &&
        Date.parse(reservation.expiresAt) <= nowMs;
      if (!expired && !staleReplay) {
        continue;
      }

      this.launchReservations.delete(reservationId);
      changed = true;
    }

    if (changed && persist) {
      void this.queuePersist();
    }
  }

  private requireProvider(providerId: string): ProviderProfile {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new InvalidRaidLaunchReservationError(
        `Reserved provider ${providerId} is no longer registered with Mercenary.`,
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
      if (reservation.spawnOutput || this.launchReservationExpired(reservation)) {
        continue;
      }
      if (reservation.reservedProviderIds.includes(providerId)) {
        activeAssignments += 1;
      }
    }

    return activeAssignments;
  }

  private refreshProviderLiveness(nowMs: number = Date.now()): void {
    for (const provider of this.providers.values()) {
      if (provider.status === "offline") {
        continue;
      }

      const ageMs = providerHeartbeatAgeMs(provider, nowMs);
      if (ageMs == null) {
        continue;
      }

      provider.status = providerIsFresh(provider, this.options.providerFreshMs, nowMs) ? "available" : "degraded";
    }
  }

  private async executeSettlement(raidId: string): Promise<void> {
    const raid = this.requireRaid(raidId);
    if (raid.parentRaidId || raid.settlementExecution || raid.status !== "final") {
      return;
    }

    const record = await this.settlementExecutor.execute(raid);
    if (!record) {
      return;
    }

    raid.settlementExecution = record;
    raid.updatedAt = new Date().toISOString();
    await this.queuePersist();
  }

  private async refreshProviderAvailability(): Promise<void> {
    const providers = [...this.providers.values()];
    if (providers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      providers.map(async (provider) => ({
        provider,
        health: await this.providerHealthProbe(provider),
      })),
    );

    for (const result of results) {
      if (result.status !== "fulfilled") {
        continue;
      }

      const { provider, health } = result.value;
      if (health.ready) {
        provider.status = "available";
        provider.lastSeenAt = new Date().toISOString();
        continue;
      }

      provider.status = health.reachable ? "degraded" : "offline";
      if (health.reachable) {
        provider.lastSeenAt = new Date().toISOString();
      }
    }

    this.refreshProviderLiveness();
  }
}

export async function createDefaultOrchestrator(
  options: Partial<RuntimeOptions> = {},
): Promise<BossRaidOrchestrator> {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const stateFile = resolveWorkspacePath(process.env.BOSSRAID_STATE_FILE, workspaceCwd);
  const sqliteFile = resolveWorkspacePath(
    process.env.BOSSRAID_SQLITE_FILE ?? "./temp/bossraid-state.sqlite",
    workspaceCwd,
  );
  const providersFile = resolveWorkspacePath(process.env.BOSSRAID_PROVIDERS_FILE, workspaceCwd);
  const storageBackend = readStorageBackend(process.env);

  const persistence = createPersistenceBackend({
    storageBackend,
    stateFile,
    sqliteFile,
  });
  const snapshot = await persistence.loadState();

  if (!providersFile) {
    throw new Error("BOSSRAID_PROVIDERS_FILE is required. Mercenary no longer boots with simulated providers.");
  }

  const profiles = await loadProviderProfilesFromFile(providersFile);
  if (profiles.length === 0) {
    throw new Error(`No providers found in ${providersFile}. Configure at least one HTTP provider.`);
  }

  const settlementExecutor = createSettlementExecutor(process.env, workspaceCwd);
  const orchestrator = new BossRaidOrchestrator(
    createProvidersFromProfiles(profiles),
    options,
    persistence,
    settlementExecutor,
  );
  orchestrator.restoreState(snapshot);
  return orchestrator;
}

function createPersistenceBackend(input: {
  storageBackend: "sqlite" | "file" | "memory";
  stateFile?: string;
  sqliteFile?: string;
}): BossRaidPersistence {
  switch (input.storageBackend) {
    case "sqlite":
      if (!input.sqliteFile) {
        throw new Error("BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.");
      }
      return new SqliteBossRaidPersistence(input.sqliteFile);
    case "file":
      if (!input.stateFile) {
        throw new Error("BOSSRAID_STATE_FILE is required when BOSSRAID_STORAGE_BACKEND=file.");
      }
      return new FileBossRaidPersistence(input.stateFile);
    case "memory":
      return new InMemoryBossRaidPersistence();
  }
}

function readStorageBackend(
  env: NodeJS.ProcessEnv,
): "sqlite" | "file" | "memory" {
  const configured = env.BOSSRAID_STORAGE_BACKEND;
  if (configured === "sqlite" || configured === "file" || configured === "memory") {
    return configured;
  }

  if (configured != null) {
    throw new Error("BOSSRAID_STORAGE_BACKEND must be sqlite, file, or memory.");
  }

  return env.BOSSRAID_STATE_FILE ? "file" : "sqlite";
}

export function runtimeOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<RuntimeOptions> {
  return readRuntimeOptionsFromEnv(env);
}
