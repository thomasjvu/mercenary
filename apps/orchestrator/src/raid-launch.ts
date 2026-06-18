import { randomBytes } from 'node:crypto';
import { ADAPTIVE_PLANNING, TIMEOUTS } from '@bossraid/constants';
import {
  annotateRoutingProof,
  buildRoutingProof,
  createRaidRecord,
  hashRaidAccessToken,
  sanitizeTask,
} from '@bossraid/raid-core';
import { buildDiscoveryQueryFromTask } from '@bossraid/provider-registry';
import type {
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  ProviderDiscoveryQuery,
  ProviderProfile,
  RaidRecord,
  SanitizedTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import {
  buildHierarchicalRaidGraph,
  type PlannedRaidNode,
  shouldUseHierarchicalPlanning,
} from './raid-hierarchy.js';
import { collectPreparedProviderIds, countPreparedExperts } from './raid-launch-reservations.js';

export {
  assertQuoteSnapshotStillValid,
  collectPreparedProviderIds,
  countPreparedExperts,
  createLaunchReservationRecord,
  findReusableLaunchReservation,
  fromReservedRaidNode,
  fromReservedSelectedProviders,
  hydrateLaunchReservation,
  InvalidRaidLaunchReservationError,
  launchReservationExpired,
  type LaunchReservationOptions,
  pruneLaunchReservations,
  STALE_RESERVATION_TIMEOUT_MS,
  toReservedRaidNode,
  toReservedSelectedProviders,
} from './raid-launch-reservations.js';

export const DEFAULT_ESTIMATED_FIRST_RESULT_SEC = TIMEOUTS.DEFAULT_ESTIMATED_FIRST_RESULT_SEC;

export class NoEligibleProvidersError extends Error {
  constructor() {
    super('No eligible providers are currently available for this raid request.');
    this.name = 'NoEligibleProvidersError';
  }
}

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

  const discoverableProviders = filterRequiredProviders(
    await discoverProvidersForRaid(buildDiscoveryQueryFromTask(node.task)),
    node.task.constraints.requiredProviderIds
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

  const discoverableProviders = filterRequiredProviders(
    await deps.discoverProvidersForRaid(buildDiscoveryQueryFromTask(sanitized)),
    sanitized.constraints.requiredProviderIds
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

function filterRequiredProviders(
  providers: ProviderProfile[],
  requiredProviderIds: string[] | undefined
): ProviderProfile[] {
  if (!requiredProviderIds?.length) {
    return providers;
  }
  const required = new Set(requiredProviderIds);
  return providers.filter((provider) => required.has(provider.providerId));
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
      receiptPath: `/verification?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
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
    receiptPath: `/verification?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(raidAccessToken)}`,
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
