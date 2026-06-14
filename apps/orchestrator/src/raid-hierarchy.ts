import { annotateRoutingProof, buildRoutingProof } from '@bossraid/raid-core';
import type {
  BossRaidRoutingProof,
  BossRaidStatusOutput,
  OutputType,
  ProviderProfile,
  RaidContributionPlan,
  RaidRecord,
  SanitizedTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import {
  buildContributionWorkstreamAllocations,
  getRootContributionFamilyId,
} from './partition/index.js';
import type { ContributionFamilyId, ContributionWorkstreamTemplate } from './partition/types.js';
import {
  TERMINAL_RAID_STATUSES,
  buildAdaptivePlanningOutput,
  buildRaidStatusOutput,
  refreshRaidRankings,
} from './raid-state.js';

export type PlannedRaidNode = {
  task: SanitizedTaskSpec;
  contributionPlan?: RaidContributionPlan;
  children?: PlannedRaidNode[];
};

export function shouldUseHierarchicalPlanning(task: SanitizedTaskSpec): boolean {
  const primaryType = task.output?.primaryType ?? 'patch';
  return task.constraints.numExperts > 1 && (primaryType === 'patch' || primaryType === 'text');
}

export function buildHierarchicalRaidGraph(task: SanitizedTaskSpec): PlannedRaidNode {
  return {
    task,
    children: buildContributionFamilyRaidGraph(
      task,
      getRootContributionFamilyId(task),
      task.constraints.numExperts
    ),
  };
}

export function buildContributionFamilyRaidGraph(
  task: SanitizedTaskSpec,
  familyId: ContributionFamilyId,
  totalExperts: number
): PlannedRaidNode[] {
  return buildFamilyNodes(task, familyId, totalExperts);
}

function buildFamilyNodes(
  task: SanitizedTaskSpec,
  familyId: Parameters<typeof buildContributionWorkstreamAllocations>[0]['familyId'],
  totalExperts: number
): PlannedRaidNode[] {
  const allocations = buildContributionWorkstreamAllocations({
    task,
    totalExperts,
    familyId,
  });

  const children: PlannedRaidNode[] = [];
  let nextProviderIndex = 1;

  for (const allocation of allocations) {
    const nodes = expandWorkstream(
      task,
      allocation.template,
      allocation.assignedExperts,
      totalExperts,
      nextProviderIndex
    );
    children.push(...nodes);
    nextProviderIndex += allocation.assignedExperts;
  }

  return children;
}

function expandWorkstream(
  parentTask: SanitizedTaskSpec,
  template: ContributionWorkstreamTemplate,
  assignedExperts: number,
  familyTotalExperts: number,
  providerIndexStart: number
): PlannedRaidNode[] {
  if (template.childFamilyId && assignedExperts > template.roles.length) {
    const childTask = buildScopedTask(parentTask, template, assignedExperts);
    const leadRole = template.roles[0]!;

    return [
      {
        task: childTask,
        contributionPlan: toContributionPlan(
          template,
          leadRole,
          familyTotalExperts,
          providerIndexStart
        ),
        children: buildFamilyNodes(childTask, template.childFamilyId, assignedExperts),
      },
    ];
  }

  return expandRoles(template, assignedExperts).map((role, index) => ({
    task: buildScopedTask(parentTask, template, 1),
    contributionPlan: toContributionPlan(
      template,
      role,
      familyTotalExperts,
      providerIndexStart + index
    ),
  }));
}

function buildScopedTask(
  task: SanitizedTaskSpec,
  template: ContributionWorkstreamTemplate,
  numExperts: number
): SanitizedTaskSpec {
  const primaryType = template.primaryType;
  const artifactTypes: OutputType[] =
    template.artifactTypesOverride ?? (primaryType === 'patch' ? ['patch', 'text'] : [primaryType]);
  const perExpertBudget = Number(
    (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2)
  );

  return {
    ...task,
    language: template.languageOverride ?? task.language,
    framework:
      template.frameworkOverride === null
        ? undefined
        : (template.frameworkOverride ?? task.framework),
    output: {
      primaryType,
      artifactTypes,
    },
    constraints: {
      ...task.constraints,
      numExperts,
      maxBudgetUsd: Math.max(perExpertBudget * numExperts, 0.01),
      allowedOutputTypes: artifactTypes,
      requireSpecializations: buildScopedSpecializations(
        task.constraints.requireSpecializations,
        template.routeSpecializations
      ),
    },
  };
}

function expandRoles(template: ContributionWorkstreamTemplate, totalExperts: number) {
  return Array.from(
    { length: Math.max(1, totalExperts) },
    (_, index) => template.roles[index] ?? template.roles[index % template.roles.length]!
  );
}

function toContributionPlan(
  template: ContributionWorkstreamTemplate,
  role: ContributionWorkstreamTemplate['roles'][number],
  totalExperts: number,
  providerIndex: number
): RaidContributionPlan {
  return {
    providerIndex,
    totalExperts,
    roleId: role.id,
    roleLabel: role.label,
    roleObjective: role.objective,
    workstreamId: template.id,
    workstreamLabel: template.label,
    workstreamObjective: template.objective,
    prompt: role.prompt,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function buildScopedSpecializations(
  inheritedSpecializations: string[],
  routeSpecializations: string[] | undefined
): string[] {
  if (!routeSpecializations?.length) {
    return unique(inheritedSpecializations);
  }

  const filteredInherited = inheritedSpecializations.filter(
    (value) => !GAME_ROUTE_SPECIALIZATIONS.has(normalizeCapability(value))
  );

  return unique([...filteredInherited, ...routeSpecializations]);
}

function normalizeCapability(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

const GAME_ROUTE_SPECIALIZATIONS = new Set([
  'gb-studio',
  'gbstudio',
  'pixel-art',
  'pixel-artist',
  'remotion',
  'video-marketing',
  'video-marketer',
]);

export type RaidLookup = (raidId: string) => RaidRecord;
export type ProviderLookup = (providerId: string) => ProviderProfile | undefined;

export function collectLeafRaids(raid: RaidRecord, getRaid: RaidLookup): RaidRecord[] {
  if (!raid.childRaidIds?.length) {
    return [raid];
  }

  return raid.childRaidIds.flatMap((childRaidId) =>
    collectLeafRaids(getRaid(childRaidId), getRaid)
  );
}

export function refreshParentRaidFromChildren(raidId: string, getRaid: RaidLookup): void {
  const raid = getRaid(raidId);
  if (!raid.childRaidIds?.length) {
    return;
  }

  const childRaids = raid.childRaidIds.map((childRaidId) => {
    const childRaid = getRaid(childRaidId);
    if (childRaid.childRaidIds?.length) {
      refreshParentRaidFromChildren(childRaidId, getRaid);
    }
    return childRaid;
  });
  const rankedSubmissions = childRaids.flatMap((childRaid) => childRaid.rankedSubmissions);
  const firstValidSubmission = rankedSubmissions.find((entry) => entry.breakdown.valid);

  refreshRaidRankings(raid, rankedSubmissions);
  raid.primarySubmissionId = firstValidSubmission?.submission.providerId;
  raid.firstValidSubmissionId = firstValidSubmission?.submission.providerId;
  raid.updatedAt = new Date().toISOString();

  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }

  const hasDispatchingChild = childRaids.some((childRaid) =>
    ['sanitizing', 'queued', 'dispatching'].includes(childRaid.status)
  );
  const hasRunningChild = childRaids.some((childRaid) =>
    ['running', 'first_valid', 'evaluating'].includes(childRaid.status)
  );

  if (firstValidSubmission) {
    raid.status = 'first_valid';
    return;
  }

  raid.status = hasRunningChild ? 'running' : hasDispatchingChild ? 'dispatching' : raid.status;
}

export function buildRaidRoutingProofOutput(
  raid: RaidRecord,
  getRaid: RaidLookup,
  getProvider: ProviderLookup
): BossRaidRoutingProof | undefined {
  if (raid.childRaidIds?.length) {
    const providers = collectLeafRaids(raid, getRaid).flatMap(
      (childRaid) => buildRaidRoutingProofOutput(childRaid, getRaid, getProvider)?.providers ?? []
    );

    if (providers.length === 0) {
      return undefined;
    }

    return {
      policy:
        raid.routingProof?.policy ??
        buildRoutingProof(raid.task, { primaries: [], reserves: [] }).policy,
      providers,
    };
  }

  if (raid.routingProof) {
    return raid.contributionPlan
      ? annotateRoutingProof(raid.routingProof, raid.contributionPlan)
      : raid.routingProof;
  }

  const selectedProviders: SelectedProviders = {
    primaries: raid.selectedProviders
      .map((providerId) => getProvider(providerId))
      .filter((provider): provider is ProviderProfile => provider != null),
    reserves: raid.reserveProviders
      .map((providerId) => getProvider(providerId))
      .filter((provider): provider is ProviderProfile => provider != null),
  };

  if (selectedProviders.primaries.length === 0 && selectedProviders.reserves.length === 0) {
    return undefined;
  }

  const derived = buildRoutingProof(raid.task, selectedProviders);
  return raid.contributionPlan ? annotateRoutingProof(derived, raid.contributionPlan) : derived;
}

export function buildHierarchicalRaidStatusOutput(
  raid: RaidRecord,
  getRaid: RaidLookup
): BossRaidStatusOutput {
  const now = Date.now();
  const childRaids = collectLeafRaids(raid, getRaid);

  return {
    raidId: raid.id,
    status: raid.status,
    experts: childRaids.flatMap((childRaid) =>
      Object.values(childRaid.assignments).map((assignment) => ({
        providerId: assignment.providerId,
        status: assignment.status,
        latencyMs: assignment.latencyMs,
        heartbeatAgeMs: assignment.lastHeartbeatAt
          ? now - Date.parse(assignment.lastHeartbeatAt)
          : undefined,
        progress: assignment.progress,
        message: childRaid.contributionPlan?.workstreamLabel
          ? `${childRaid.contributionPlan.workstreamLabel}: ${assignment.message ?? assignment.status}`
          : assignment.message,
      }))
    ),
    firstValidAvailable: Boolean(raid.firstValidSubmissionId),
    bestCurrentScore: raid.bestCurrentScore,
    adaptivePlanning: buildAdaptivePlanningOutput(raid),
    sanitization: raid.task.sanitizationReport,
  };
}

export function getRaidStatusOutput(raid: RaidRecord, getRaid: RaidLookup): BossRaidStatusOutput {
  if (raid.childRaidIds?.length) {
    refreshParentRaidFromChildren(raid.id, getRaid);
    return buildHierarchicalRaidStatusOutput(raid, getRaid);
  }
  return buildRaidStatusOutput(raid);
}
