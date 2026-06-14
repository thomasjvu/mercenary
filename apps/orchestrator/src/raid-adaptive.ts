import { ADAPTIVE_PLANNING } from '@bossraid/constants';
import { annotateRoutingProof, buildRoutingProof, createRaidRecord } from '@bossraid/raid-core';
import type {
  ProviderProfile,
  RaidContributionPlan,
  RaidRecord,
  SanitizedTaskSpec,
} from '@bossraid/shared-types';
import { buildContributionFamilyRaidGraph, type PlannedRaidNode } from './raid-hierarchy.js';
import { getContributionWorkstreamTemplate } from './partition/index.js';
import type { ContributionFamilyId } from './partition/types.js';
import {
  instantiatePreparedChildren,
  type InstantiatePreparedChildrenDeps,
  type PreparedRaidNode,
} from './raid-launch.js';
import { TERMINAL_RAID_STATUSES } from './raid-state.js';

export { ADAPTIVE_PLANNING };

export type AdaptiveReplanTarget = {
  strategy: 'expand' | 'repair';
  parentRaid: RaidRecord;
  sourceRaid: RaidRecord;
  workstreamId: string;
  workstreamLabel: string;
  reason: string;
  expertCount: number;
  childFamilyId?: ContributionFamilyId;
};

export type AdaptiveTargetGroup = {
  parentRaid: RaidRecord;
  workstreamId: string;
  workstreamLabel: string;
  children: RaidRecord[];
  depth: number;
};

export type AdaptiveReplanContext = {
  raids: Map<string, RaidRecord>;
  providers: Map<string, ProviderProfile>;
  requireRaid: (raidId: string) => RaidRecord;
  queuePersistBestEffort: () => void;
  scheduleRaidDeadline: (raidId: string) => void;
  runRaid: (raidId: string) => void;
  raidDeadlineReached: (raid: RaidRecord) => boolean;
  instantiatePreparedChildrenDeps: () => InstantiatePreparedChildrenDeps;
};

export function maybeReplanHierarchicalRaid(raidId: string, ctx: AdaptiveReplanContext): boolean {
  const raid = ctx.requireRaid(raidId);
  const adaptivePlanning = raid.adaptivePlanning;
  if (
    !raid.childRaidIds?.length ||
    !adaptivePlanning ||
    adaptivePlanning.availableProviderIds.length === 0 ||
    adaptivePlanning.revisionCount >= adaptivePlanning.maxRevisions ||
    TERMINAL_RAID_STATUSES.has(raid.status) ||
    ctx.raidDeadlineReached(raid)
  ) {
    return false;
  }

  const target = selectAdaptiveReplanTarget(raid, ctx);
  if (!target) {
    return false;
  }

  const providers = takeAdaptiveProviders(adaptivePlanning, ctx.providers, target.expertCount);
  if (providers.length === 0) {
    return false;
  }

  const actualStrategy =
    target.strategy === 'expand' && target.childFamilyId && providers.length > 1
      ? 'expand'
      : 'repair';
  const spawnedRaid =
    actualStrategy === 'expand'
      ? spawnAdaptiveExpansionRaid(target.parentRaid, target, target.childFamilyId!, providers, ctx)
      : spawnAdaptiveRepairRaid(target.parentRaid, target, providers[0]!, ctx);

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
  raid.status = 'dispatching';
  raid.updatedAt = createdAt;
  ctx.queuePersistBestEffort();
  ctx.runRaid(spawnedRaid.id);
  return true;
}

function selectAdaptiveReplanTarget(
  raid: RaidRecord,
  ctx: AdaptiveReplanContext
): AdaptiveReplanTarget | undefined {
  const adaptivePlanning = raid.adaptivePlanning;
  if (!adaptivePlanning) {
    return undefined;
  }

  const candidates = collectAdaptiveTargetGroups(raid, ctx).flatMap((group) => {
    if (group.children.some((child) => !TERMINAL_RAID_STATUSES.has(child.status))) {
      return [];
    }

    const revisionCount = countAdaptiveRevisions(raid, group.parentRaid.id, group.workstreamId);
    if (revisionCount >= ADAPTIVE_PLANNING.MAX_REVISIONS_PER_WORKSTREAM) {
      return [];
    }

    const validChildren = group.children.filter((child) => raidHasValidOutput(child));
    const sourceRaid = [...(validChildren.length > 0 ? validChildren : group.children)].sort(
      (left, right) => (right.bestCurrentScore ?? 0) - (left.bestCurrentScore ?? 0)
    )[0];

    if (!sourceRaid?.contributionPlan) {
      return [];
    }

    const template = getContributionWorkstreamTemplate(
      sourceRaid.task,
      sourceRaid.contributionPlan.workstreamId
    );
    const expansionCount = computeAdaptiveExpansionExperts(
      adaptivePlanning.availableProviderIds.length,
      validChildren.length === 0 ? 'missing' : 'weak'
    );
    const canExpand =
      template?.childFamilyId != null &&
      expansionCount >= ADAPTIVE_PLANNING.MIN_EXPANSION_TO_TRIGGER &&
      countAdaptiveRevisions(raid, group.parentRaid.id, group.workstreamId, 'expand') === 0;

    const candidatesForGroup: Array<
      AdaptiveReplanTarget & { priority: number; depth: number; bestScore: number }
    > = [];

    if (validChildren.length === 0) {
      candidatesForGroup.push({
        strategy: canExpand ? 'expand' : 'repair',
        parentRaid: group.parentRaid,
        sourceRaid,
        workstreamId: group.workstreamId,
        workstreamLabel: group.workstreamLabel,
        reason: summarizeAdaptiveGap(group.children),
        expertCount: canExpand ? expansionCount : 1,
        childFamilyId: canExpand ? template?.childFamilyId : undefined,
        priority: 0,
        depth: group.depth,
        bestScore: 0,
      });
    }

    const bestScore = Math.max(...group.children.map((child) => child.bestCurrentScore ?? 0), 0);
    if (validChildren.length > 0 && bestScore < ADAPTIVE_PLANNING.WEAK_SCORE_THRESHOLD) {
      candidatesForGroup.push({
        strategy: canExpand ? 'expand' : 'repair',
        parentRaid: group.parentRaid,
        sourceRaid,
        workstreamId: group.workstreamId,
        workstreamLabel: group.workstreamLabel,
        reason: `Best ${group.workstreamLabel.toLowerCase()} score remained weak at ${bestScore.toFixed(2)}.`,
        expertCount: canExpand ? expansionCount : 1,
        childFamilyId: canExpand ? template?.childFamilyId : undefined,
        priority: isPriorityAdaptiveGroup(group.parentRaid, group.workstreamId) ? 1 : 2,
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

function collectAdaptiveTargetGroups(
  raid: RaidRecord,
  ctx: AdaptiveReplanContext
): AdaptiveTargetGroup[] {
  const groups: AdaptiveTargetGroup[] = [];
  const visit = (parentRaid: RaidRecord, depth: number): void => {
    if (!parentRaid.childRaidIds?.length) {
      return;
    }

    for (const group of groupDirectChildRaidsByWorkstream(parentRaid, ctx)) {
      groups.push({
        parentRaid,
        workstreamId: group.workstreamId,
        workstreamLabel: group.workstreamLabel,
        children: group.children,
        depth,
      });
    }

    for (const childRaidId of parentRaid.childRaidIds) {
      visit(ctx.requireRaid(childRaidId), depth + 1);
    }
  };

  visit(raid, 0);
  return groups;
}

function countAdaptiveRevisions(
  raid: RaidRecord,
  parentRaidId: string,
  workstreamId: string,
  strategy?: 'expand' | 'repair'
): number {
  return (
    raid.adaptivePlanning?.history.filter(
      (entry) =>
        entry.targetParentRaidId === parentRaidId &&
        entry.workstreamId === workstreamId &&
        (strategy == null || entry.strategy === strategy)
    ).length ?? 0
  );
}

function isPriorityAdaptiveGroup(parentRaid: RaidRecord, workstreamId: string): boolean {
  if (workstreamId.endsWith('-core')) {
    return true;
  }

  const primaryType = parentRaid.task.output?.primaryType ?? 'patch';
  return primaryType === 'patch'
    ? workstreamId === 'implementation' || workstreamId.startsWith('implementation-')
    : workstreamId === 'answer' || workstreamId.startsWith('answer-');
}

function groupDirectChildRaidsByWorkstream(
  raid: RaidRecord,
  ctx: AdaptiveReplanContext
): Array<{
  workstreamId: string;
  workstreamLabel: string;
  children: RaidRecord[];
}> {
  const groups = new Map<
    string,
    { workstreamId: string; workstreamLabel: string; children: RaidRecord[] }
  >();

  for (const childRaidId of raid.childRaidIds ?? []) {
    const childRaid = ctx.requireRaid(childRaidId);
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

function summarizeAdaptiveGap(childRaids: RaidRecord[]): string {
  const invalidReasons = childRaids
    .flatMap((child) => child.rankedSubmissions.flatMap((entry) => entry.breakdown.invalidReasons))
    .slice(0, 3);
  if (invalidReasons.length > 0) {
    return `No valid output yet. Invalid signals: ${invalidReasons.join(', ')}.`;
  }

  const failureMessages = childRaids
    .flatMap((child) => Object.values(child.assignments).map((assignment) => assignment.message))
    .filter((message): message is string => Boolean(message))
    .slice(0, 2);

  return failureMessages.length > 0
    ? `No valid output yet. Latest signals: ${failureMessages.join(' | ')}.`
    : 'No valid output yet for this workstream.';
}

function raidHasValidOutput(raid: RaidRecord): boolean {
  return raid.rankedSubmissions.some((entry) => entry.breakdown.valid);
}

function computeAdaptiveExpansionExperts(
  availableExperts: number,
  mode: 'missing' | 'weak'
): number {
  const cap =
    mode === 'missing'
      ? ADAPTIVE_PLANNING.EXPANSION_MISSING_CAP
      : ADAPTIVE_PLANNING.EXPANSION_WEAK_CAP;
  return Math.max(0, Math.min(availableExperts, cap));
}

function takeAdaptiveProviders(
  adaptivePlanning: NonNullable<RaidRecord['adaptivePlanning']>,
  providers: Map<string, ProviderProfile>,
  count: number
): ProviderProfile[] {
  const selectedProviders: ProviderProfile[] = [];

  while (selectedProviders.length < count && adaptivePlanning.availableProviderIds.length > 0) {
    const providerId = adaptivePlanning.availableProviderIds.shift();
    if (!providerId) {
      continue;
    }

    const provider = providers.get(providerId);
    if (provider) {
      selectedProviders.push(provider);
    }
  }

  return selectedProviders;
}

function spawnAdaptiveExpansionRaid(
  parentRaid: RaidRecord,
  target: AdaptiveReplanTarget,
  childFamilyId: ContributionFamilyId,
  providers: ProviderProfile[],
  ctx: AdaptiveReplanContext
): RaidRecord {
  const childTask = buildAdaptiveExpansionTask(target.sourceRaid.task, providers.length);
  const childRaid = createRaidRecord(
    childTask,
    {
      primaries: [],
      reserves: [],
    },
    {
      deadlineUnix: parentRaid.deadlineUnix,
    }
  );
  childRaid.planningMode = 'hierarchical_child';
  childRaid.parentRaidId = parentRaid.id;
  childRaid.contributionPlan = buildAdaptiveExpansionPlan(
    target.sourceRaid,
    target.reason,
    providers.length
  );
  childRaid.routingProof = annotateRoutingProof(
    childRaid.routingProof ?? buildRoutingProof(childTask, { primaries: [], reserves: [] }),
    childRaid.contributionPlan
  );
  childRaid.childRaidIds = [];
  ctx.raids.set(childRaid.id, childRaid);
  ctx.scheduleRaidDeadline(childRaid.id);

  const graph = buildContributionFamilyRaidGraph(childTask, childFamilyId, providers.length);
  const preparedChildren = assignAdaptiveProvidersToGraph(graph, providers, target.reason);

  reopenRaidAncestry(parentRaid.id, ctx);
  parentRaid.childRaidIds ??= [];
  parentRaid.childRaidIds.push(childRaid.id);
  instantiatePreparedChildren(
    childRaid.id,
    preparedChildren,
    parentRaid.deadlineUnix,
    ctx.instantiatePreparedChildrenDeps()
  );
  return childRaid;
}

function assignAdaptiveProvidersToGraph(
  nodes: PlannedRaidNode[],
  providers: ProviderProfile[],
  reason: string
): PreparedRaidNode[] {
  let providerIndex = 0;

  const assignNode = (node: PlannedRaidNode): PreparedRaidNode => {
    const prepared: PreparedRaidNode = {
      task: node.task,
      contributionPlan: annotateAdaptiveContributionPlan(node.contributionPlan, reason),
    };

    if (node.children?.length) {
      prepared.children = node.children.map(assignNode);
      return prepared;
    }

    const provider = providers[providerIndex];
    providerIndex += 1;
    if (!provider) {
      throw new Error('Adaptive provider allocation underflow while revising the raid graph.');
    }

    prepared.selectedProviders = {
      primaries: [provider],
      reserves: [],
    };
    return prepared;
  };

  return nodes.map(assignNode);
}

function annotateAdaptiveContributionPlan(
  plan: RaidContributionPlan | undefined,
  reason: string
): RaidContributionPlan | undefined {
  if (!plan) {
    return undefined;
  }

  return {
    ...plan,
    prompt: [
      plan.prompt,
      reason,
      'Close the observed gap directly and avoid repeating the earlier miss.',
    ].join(' '),
  };
}

function spawnAdaptiveRepairRaid(
  parentRaid: RaidRecord,
  target: AdaptiveReplanTarget,
  provider: ProviderProfile,
  ctx: AdaptiveReplanContext
): RaidRecord {
  const childTask = buildAdaptiveRepairTask(target.sourceRaid.task);
  const childRaid = createRaidRecord(
    childTask,
    {
      primaries: [provider],
      reserves: [],
    },
    {
      deadlineUnix: parentRaid.deadlineUnix,
    }
  );
  childRaid.planningMode = 'hierarchical_child';
  childRaid.parentRaidId = parentRaid.id;
  childRaid.contributionPlan = buildAdaptiveRepairPlan(target.sourceRaid, target.reason);
  childRaid.routingProof = annotateRoutingProof(
    childRaid.routingProof ?? buildRoutingProof(childTask, { primaries: [provider], reserves: [] }),
    childRaid.contributionPlan
  );
  childRaid.childRaidIds = [];
  ctx.raids.set(childRaid.id, childRaid);
  ctx.scheduleRaidDeadline(childRaid.id);
  reopenRaidAncestry(parentRaid.id, ctx);
  parentRaid.childRaidIds ??= [];
  parentRaid.childRaidIds.push(childRaid.id);
  return childRaid;
}

function reopenRaidAncestry(raidId: string | undefined, ctx: AdaptiveReplanContext): void {
  const reopenedAt = new Date().toISOString();
  let currentRaidId = raidId;

  while (currentRaidId) {
    const currentRaid = ctx.requireRaid(currentRaidId);
    if (TERMINAL_RAID_STATUSES.has(currentRaid.status)) {
      currentRaid.status = 'dispatching';
    }
    currentRaid.updatedAt = reopenedAt;
    currentRaidId = currentRaid.parentRaidId;
  }
}

function buildAdaptiveRepairTask(task: SanitizedTaskSpec): SanitizedTaskSpec {
  const perExpertBudget = Number(
    (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2)
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

function buildAdaptiveExpansionTask(
  task: SanitizedTaskSpec,
  expertCount: number
): SanitizedTaskSpec {
  const perExpertBudget = Number(
    (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2)
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

function buildAdaptiveExpansionPlan(
  sourceRaid: RaidRecord,
  reason: string,
  expertCount: number
): RaidContributionPlan {
  const sourcePlan = sourceRaid.contributionPlan;
  if (!sourcePlan) {
    throw new Error(
      `Cannot build adaptive expansion plan for raid ${sourceRaid.id} without contribution metadata.`
    );
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
      'Break this workstream into narrower sub-workstreams and close the missing or weak coverage directly.',
    ].join(' '),
  };
}

function buildAdaptiveRepairPlan(sourceRaid: RaidRecord, reason: string): RaidContributionPlan {
  const sourcePlan = sourceRaid.contributionPlan;
  if (!sourcePlan) {
    throw new Error(
      `Cannot build adaptive repair plan for raid ${sourceRaid.id} without contribution metadata.`
    );
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
      'Fill the gap directly and avoid repeating the earlier failure.',
    ].join(' '),
  };
}
