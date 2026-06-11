import { createHash, randomBytes } from 'node:crypto';
import { ADAPTIVE_PLANNING, TIMEOUTS } from '@bossraid/constants';
import { providerHasPrivacyFeature } from '@bossraid/provider-registry';
import {
  annotateRoutingProof,
  buildRaidQuoteSnapshot,
  buildRoutingProof,
  createRaidRecord,
  hashRaidAccessToken,
  readProviderPricing,
  sanitizeTask,
} from '@bossraid/raid-core';
import { buildDiscoveryQueryFromTask } from '@bossraid/provider-registry';
import type {
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  ProviderDiscoveryQuery,
  ProviderProfile,
  RaidLaunchReservationRecord,
  RaidQuoteSnapshot,
  RaidRecord,
  ReservedRaidNode,
  ReservedSelectedProviders,
  SanitizedTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import {
  buildHierarchicalRaidGraph,
  type PlannedRaidNode,
  shouldUseHierarchicalPlanning,
} from './hierarchy.js';

export const STALE_RESERVATION_TIMEOUT_MS = TIMEOUTS.STALE_RESERVATION;
export const DEFAULT_ESTIMATED_FIRST_RESULT_SEC = TIMEOUTS.DEFAULT_ESTIMATED_FIRST_RESULT_SEC;

export class InvalidRaidLaunchReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRaidLaunchReservationError';
  }
}

export class NoEligibleProvidersError extends Error {
  constructor() {
    super('No eligible providers are currently available for this raid request.');
    this.name = 'NoEligibleProvidersError';
  }
}

export type LaunchReservationOptions = {
  route: 'raid' | 'chat';
  requestKey: string;
  holdUntilUnix?: number;
};

export type PreparedLeafRaid = {
  mode: 'single';
  sanitized: SanitizedTaskSpec;
  selectedProviders: SelectedProviders;
};

export type PreparedRaidNode = PlannedRaidNode & {
  selectedProviders?: SelectedProviders;
  children?: PreparedRaidNode[];
};

export type PreparedHierarchicalRaid = {
  mode: 'hierarchical';
  sanitized: SanitizedTaskSpec;
  graph: PreparedRaidNode;
  adaptiveProviderIds: string[];
};

export function createRaidAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

export function launchReservationExpired(reservation: RaidLaunchReservationRecord): boolean {
  return Date.parse(reservation.expiresAt) <= Date.now();
}

export function findReusableLaunchReservation(
  launchReservations: Map<string, RaidLaunchReservationRecord>,
  route: RaidLaunchReservationRecord['route'],
  requestKey: string
): RaidLaunchReservationRecord | undefined {
  return [...launchReservations.values()].find(
    (reservation) =>
      reservation.route === route &&
      reservation.requestKey === requestKey &&
      reservation.spawnOutput == null &&
      !launchReservationExpired(reservation)
  );
}

export function pruneLaunchReservations(
  launchReservations: Map<string, RaidLaunchReservationRecord>,
  onChanged: () => void,
  persist = true
): void {
  const nowMs = Date.now();
  let changed = false;

  for (const [reservationId, reservation] of launchReservations.entries()) {
    const staleReplay =
      reservation.spawnOutput != null &&
      Date.parse(reservation.createdAt) + STALE_RESERVATION_TIMEOUT_MS <= nowMs;
    const expired = reservation.spawnOutput == null && Date.parse(reservation.expiresAt) <= nowMs;
    if (!expired && !staleReplay) {
      continue;
    }

    launchReservations.delete(reservationId);
    changed = true;
  }

  if (changed && persist) {
    onChanged();
  }
}

export function toReservedSelectedProviders(
  selectedProviders: SelectedProviders
): ReservedSelectedProviders {
  return {
    primaries: selectedProviders.primaries.map((provider) => provider.providerId),
    reserves: selectedProviders.reserves.map((provider) => provider.providerId),
  };
}

export function assertQuoteSnapshotStillValid(
  quoteSnapshot: RaidQuoteSnapshot,
  selectedProviders: SelectedProviders
): void {
  const currentProviders = new Map(
    [...selectedProviders.primaries, ...selectedProviders.reserves].map((provider) => [
      provider.providerId,
      provider,
    ])
  );

  for (const snapshot of quoteSnapshot.providers) {
    const current = currentProviders.get(snapshot.providerId);
    if (!current) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} is no longer selected.`
      );
    }
    const endpointHash = createHash('sha256').update(current.endpoint).digest('hex');
    if (endpointHash !== snapshot.endpointHash) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} changed endpoint before execution.`
      );
    }
    if (readProviderPricing(current).rateCardHash !== snapshot.rateCard.rateCardHash) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} changed its rate card before execution.`
      );
    }
    if (
      quoteSnapshot.requiredVerificationStatus &&
      current.verification?.status !== quoteSnapshot.requiredVerificationStatus
    ) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} no longer satisfies verification requirements.`
      );
    }
    for (const feature of quoteSnapshot.requiredPrivacyFeatures) {
      if (!providerHasPrivacyFeature(current, feature)) {
        throw new InvalidRaidLaunchReservationError(
          `Quoted provider ${snapshot.providerId} no longer satisfies privacy feature ${feature}.`
        );
      }
    }
  }
}

export function fromReservedSelectedProviders(
  selectedProviders: ReservedSelectedProviders,
  requireProvider: (providerId: string) => ProviderProfile,
  quoteSnapshot?: RaidQuoteSnapshot
): SelectedProviders {
  const selected = {
    primaries: selectedProviders.primaries.map((providerId) => requireProvider(providerId)),
    reserves: selectedProviders.reserves.map((providerId) => requireProvider(providerId)),
  };

  if (quoteSnapshot) {
    assertQuoteSnapshotStillValid(quoteSnapshot, selected);
  }

  return selected;
}

export function toReservedRaidNode(
  node: PreparedRaidNode,
  toReservedProviders: (selectedProviders: SelectedProviders) => ReservedSelectedProviders
): ReservedRaidNode {
  return {
    task: node.task,
    contributionPlan: node.contributionPlan,
    selectedProviders: node.selectedProviders
      ? toReservedProviders(node.selectedProviders)
      : undefined,
    children: node.children?.map((child) => toReservedRaidNode(child, toReservedProviders)),
  };
}

export function fromReservedRaidNode(
  node: ReservedRaidNode,
  fromReservedProviders: (
    selectedProviders: ReservedSelectedProviders,
    quoteSnapshot?: RaidQuoteSnapshot
  ) => SelectedProviders
): PreparedRaidNode {
  return {
    task: node.task,
    contributionPlan: node.contributionPlan,
    selectedProviders: node.selectedProviders
      ? fromReservedProviders(node.selectedProviders)
      : undefined,
    children: node.children?.map((child) => fromReservedRaidNode(child, fromReservedProviders)),
  };
}

export function collectPreparedProviderIds(node: PreparedRaidNode): Set<string> {
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

export function countPreparedExperts(node: PreparedRaidNode, mode: 'selected' | 'reserve'): number {
  if (node.children?.length) {
    return node.children.reduce((sum, child) => sum + countPreparedExperts(child, mode), 0);
  }

  if (!node.selectedProviders) {
    return 0;
  }

  return mode === 'selected'
    ? node.selectedProviders.primaries.length
    : node.selectedProviders.reserves.length;
}

export function createLaunchReservationRecord(
  prepared: PreparedLeafRaid | PreparedHierarchicalRaid,
  options: {
    route: RaidLaunchReservationRecord['route'];
    requestKey: string;
    deadlineUnix: number;
    holdUntilUnix: number;
  }
): RaidLaunchReservationRecord {
  const expiresAt = new Date(options.holdUntilUnix * 1_000).toISOString();
  const reservedProviderIds = [
    ...new Set(
      prepared.mode === 'hierarchical'
        ? [...collectPreparedProviderIds(prepared.graph), ...prepared.adaptiveProviderIds]
        : [
            ...prepared.selectedProviders.primaries.map((provider) => provider.providerId),
            ...prepared.selectedProviders.reserves.map((provider) => provider.providerId),
          ]
    ),
  ];

  return {
    id: `reservation_${randomBytes(12).toString('hex')}`,
    route: options.route,
    requestKey: options.requestKey,
    createdAt: new Date().toISOString(),
    expiresAt,
    paymentTimeoutSeconds: Math.max(1, options.holdUntilUnix - Math.floor(Date.now() / 1_000)),
    deadlineUnix: options.deadlineUnix,
    mode: prepared.mode,
    sanitized: prepared.sanitized,
    selectedProviders:
      prepared.mode === 'single'
        ? toReservedSelectedProviders(prepared.selectedProviders)
        : undefined,
    quoteSnapshot:
      prepared.mode === 'single'
        ? buildRaidQuoteSnapshot(prepared.sanitized, prepared.selectedProviders, { expiresAt })
        : undefined,
    graph:
      prepared.mode === 'hierarchical'
        ? toReservedRaidNode(prepared.graph, toReservedSelectedProviders)
        : undefined,
    adaptiveProviderIds:
      prepared.mode === 'hierarchical' ? [...prepared.adaptiveProviderIds] : undefined,
    reservedProviderIds,
  };
}

export function hydrateLaunchReservation(
  reservation: RaidLaunchReservationRecord,
  requireProvider: (providerId: string) => ProviderProfile
): PreparedLeafRaid | PreparedHierarchicalRaid {
  const fromReservedProviders = (
    selectedProviders: ReservedSelectedProviders,
    quoteSnapshot?: RaidQuoteSnapshot
  ) => fromReservedSelectedProviders(selectedProviders, requireProvider, quoteSnapshot);

  if (reservation.mode === 'single') {
    if (!reservation.selectedProviders) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} is missing its selected provider set.`
      );
    }

    return {
      mode: 'single',
      sanitized: reservation.sanitized,
      selectedProviders: fromReservedProviders(
        reservation.selectedProviders,
        reservation.quoteSnapshot
      ),
    };
  }

  if (!reservation.graph) {
    throw new InvalidRaidLaunchReservationError(
      `Raid launch reservation ${reservation.id} is missing its hierarchical graph.`
    );
  }

  return {
    mode: 'hierarchical',
    sanitized: reservation.sanitized,
    graph: fromReservedRaidNode(reservation.graph, fromReservedProviders),
    adaptiveProviderIds: [...(reservation.adaptiveProviderIds ?? [])],
  };
}

function computeAdaptiveReserveExperts(totalExperts: number): number {
  if (totalExperts < ADAPTIVE_PLANNING.MIN_EXPERTS_FOR_RESERVES) {
    return 0;
  }

  return Math.min(
    ADAPTIVE_PLANNING.MAX_ADAPTIVE_RESERVES,
    Math.max(1, Math.floor(totalExperts / ADAPTIVE_PLANNING.RESERVE_RATIO))
  );
}

async function assignProvidersToGraph(
  node: PlannedRaidNode,
  reservedProviderIds: Set<string>,
  includeLeafReserves: boolean,
  discoverProvidersForRaid: (query?: ProviderDiscoveryQuery) => Promise<ProviderProfile[]>,
  selectProvidersForTask: (
    task: SanitizedTaskSpec,
    providers: ProviderProfile[]
  ) => SelectedProviders
): Promise<PreparedRaidNode | undefined> {
  const prepared: PreparedRaidNode = {
    task: node.task,
    contributionPlan: node.contributionPlan,
  };

  if (node.children?.length) {
    const preparedChildren: PreparedRaidNode[] = [];
    for (const child of node.children) {
      const preparedChild = await assignProvidersToGraph(
        child,
        reservedProviderIds,
        includeLeafReserves,
        discoverProvidersForRaid,
        selectProvidersForTask
      );
      if (!preparedChild) {
        return undefined;
      }
      preparedChildren.push(preparedChild);
    }
    prepared.children = preparedChildren;
    return prepared;
  }

  const discoverableProviders = await discoverProvidersForRaid(
    buildDiscoveryQueryFromTask(node.task)
  );
  const selectedProviders = selectProvidersForTask(
    node.task,
    discoverableProviders.filter((provider) => !reservedProviderIds.has(provider.providerId))
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

async function prepareHierarchicalGraph(
  sanitized: SanitizedTaskSpec,
  discoverProvidersForRaid: (query?: ProviderDiscoveryQuery) => Promise<ProviderProfile[]>,
  selectProvidersForTask: (
    task: SanitizedTaskSpec,
    providers: ProviderProfile[]
  ) => SelectedProviders
): Promise<{ graph: PreparedRaidNode; adaptiveProviderIds: string[] } | undefined> {
  const adaptiveReserveExperts = computeAdaptiveReserveExperts(sanitized.constraints.numExperts);
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

  const preparedGraph = await assignProvidersToGraph(
    graph,
    new Set<string>(),
    adaptiveReserveExperts === 0,
    discoverProvidersForRaid,
    selectProvidersForTask
  );
  if (!preparedGraph) {
    return undefined;
  }

  const discoverableProviders = await discoverProvidersForRaid(
    buildDiscoveryQueryFromTask(sanitized)
  );
  const usedProviderIds = collectPreparedProviderIds(preparedGraph);
  const adaptiveProviderIds = discoverableProviders
    .map((provider) => provider.providerId)
    .filter((providerId) => !usedProviderIds.has(providerId))
    .slice(0, adaptiveReserveExperts);

  return {
    graph: preparedGraph,
    adaptiveProviderIds,
  };
}

export type PrepareRaidDeps = {
  discoverProvidersForRaid: (query?: ProviderDiscoveryQuery) => Promise<ProviderProfile[]>;
  selectProvidersForTask: (
    task: SanitizedTaskSpec,
    providers: ProviderProfile[]
  ) => SelectedProviders;
};

export async function prepareRaid(
  input: BossRaidSpawnInput,
  deps: PrepareRaidDeps
): Promise<PreparedLeafRaid | PreparedHierarchicalRaid> {
  const sanitized = sanitizeTask(input);

  if (shouldUseHierarchicalPlanning(sanitized)) {
    const graph = await prepareHierarchicalGraph(
      sanitized,
      deps.discoverProvidersForRaid,
      deps.selectProvidersForTask
    );
    if (graph != null) {
      return {
        mode: 'hierarchical',
        sanitized,
        graph: graph.graph,
        adaptiveProviderIds: graph.adaptiveProviderIds,
      };
    }
  }

  const discoverableProviders = await deps.discoverProvidersForRaid(
    buildDiscoveryQueryFromTask(sanitized)
  );
  const selectedProviders = deps.selectProvidersForTask(sanitized, discoverableProviders);
  if (selectedProviders.primaries.length === 0) {
    throw new NoEligibleProvidersError();
  }

  return {
    mode: 'single',
    sanitized,
    selectedProviders,
  };
}

export function computeRootDeadlineUnix(task: SanitizedTaskSpec, raidAbsoluteMs: number): number {
  return Math.ceil(
    (Date.now() + Math.min(raidAbsoluteMs, task.constraints.maxLatencySec * 1_000)) / 1_000
  );
}

export type InstantiatePreparedChildrenDeps = {
  raids: Map<string, RaidRecord>;
  requireRaid: (raidId: string) => RaidRecord;
  scheduleRaidDeadline: (raidId: string) => void;
};

export function instantiatePreparedChildren(
  parentRaidId: string,
  children: PreparedRaidNode[],
  deadlineUnix: number,
  deps: InstantiatePreparedChildrenDeps
): void {
  const parentRaid = deps.requireRaid(parentRaidId);
  parentRaid.childRaidIds ??= [];

  for (const child of children) {
    const childRaid = createRaidRecord(
      child.task,
      child.selectedProviders ?? { primaries: [], reserves: [] },
      {
        deadlineUnix,
      }
    );
    childRaid.planningMode = 'hierarchical_child';
    childRaid.parentRaidId = parentRaidId;
    childRaid.contributionPlan = child.contributionPlan;
    childRaid.routingProof = annotateRoutingProof(
      childRaid.routingProof ??
        buildRoutingProof(child.task, child.selectedProviders ?? { primaries: [], reserves: [] }),
      child.contributionPlan
    );
    childRaid.childRaidIds = [];
    deps.raids.set(childRaid.id, childRaid);
    deps.scheduleRaidDeadline(childRaid.id);
    parentRaid.childRaidIds.push(childRaid.id);

    if (child.children?.length) {
      instantiatePreparedChildren(childRaid.id, child.children, deadlineUnix, deps);
    }
  }
}

export type SpawnPreparedRaidDeps = {
  raids: Map<string, RaidRecord>;
  scheduleRaidDeadline: (raidId: string) => void;
  instantiatePreparedChildren: (
    parentRaidId: string,
    children: PreparedRaidNode[],
    deadlineUnix: number
  ) => void;
  queuePersist: () => Promise<void>;
  runRaid: (raidId: string) => void;
};

export async function spawnPreparedRaid(
  prepared: PreparedLeafRaid | PreparedHierarchicalRaid,
  deadlineUnix: number,
  escrowFundingUsd: number | undefined,
  platformMarkupUsd: number | undefined,
  deps: SpawnPreparedRaidDeps
): Promise<BossRaidSpawnOutput> {
  const raidAccessToken = createRaidAccessToken();

  if (prepared.mode === 'hierarchical') {
    const raid = createRaidRecord(
      prepared.sanitized,
      { primaries: [], reserves: [] },
      { deadlineUnix }
    );
    raid.status = 'sanitizing';
    raid.planningMode = 'hierarchical_parent';
    raid.childRaidIds = [];
    raid.escrowFundingUsd = escrowFundingUsd;
    raid.platformMarkupUsd = platformMarkupUsd;
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
    deps.raids.set(raid.id, raid);
    deps.scheduleRaidDeadline(raid.id);
    deps.instantiatePreparedChildren(raid.id, prepared.graph.children ?? [], deadlineUnix);

    await deps.queuePersist();
    void deps.runRaid(raid.id);

    return {
      raidId: raid.id,
      raidAccessToken,
      receiptPath: `/receipt?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
      status: raid.status,
      selectedExperts: countPreparedExperts(prepared.graph, 'selected'),
      reserveExperts:
        countPreparedExperts(prepared.graph, 'reserve') + prepared.adaptiveProviderIds.length,
      estimatedFirstResultSec: Math.min(
        DEFAULT_ESTIMATED_FIRST_RESULT_SEC,
        prepared.sanitized.constraints.maxLatencySec
      ),
      sanitization: prepared.sanitized.sanitizationReport,
    };
  }

  const raid = createRaidRecord(prepared.sanitized, prepared.selectedProviders, { deadlineUnix });
  raid.status = 'sanitizing';
  raid.planningMode = 'single_raid';
  raid.raidAccessTokenHash = hashRaidAccessToken(raidAccessToken);
  raid.escrowFundingUsd = escrowFundingUsd;
  raid.platformMarkupUsd = platformMarkupUsd;
  deps.raids.set(raid.id, raid);
  deps.scheduleRaidDeadline(raid.id);
  await deps.queuePersist();
  void deps.runRaid(raid.id);

  return {
    raidId: raid.id,
    raidAccessToken,
    receiptPath: `/receipt?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
    status: raid.status,
    selectedExperts: prepared.selectedProviders.primaries.length,
    reserveExperts: prepared.selectedProviders.reserves.length,
    estimatedFirstResultSec: Math.min(
      DEFAULT_ESTIMATED_FIRST_RESULT_SEC,
      prepared.sanitized.constraints.maxLatencySec
    ),
    sanitization: prepared.sanitized.sanitizationReport,
  };
}
