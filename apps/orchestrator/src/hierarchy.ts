import type { OutputType, RaidContributionPlan, SanitizedTaskSpec } from "@bossraid/shared-types";
import {
  buildContributionWorkstreamAllocations,
  getRootContributionFamilyId,
  type ContributionFamilyId,
  type ContributionWorkstreamTemplate,
} from "./partition.js";

export type PlannedRaidNode = {
  task: SanitizedTaskSpec;
  contributionPlan?: RaidContributionPlan;
  children?: PlannedRaidNode[];
};

export function shouldUseHierarchicalPlanning(task: SanitizedTaskSpec): boolean {
  const primaryType = task.output?.primaryType ?? "patch";
  return task.constraints.numExperts > 1 && (primaryType === "patch" || primaryType === "text");
}

export function buildHierarchicalRaidGraph(task: SanitizedTaskSpec): PlannedRaidNode {
  return {
    task,
    children: buildContributionFamilyRaidGraph(task, getRootContributionFamilyId(task), task.constraints.numExperts),
  };
}

export function buildContributionFamilyRaidGraph(
  task: SanitizedTaskSpec,
  familyId: ContributionFamilyId,
  totalExperts: number,
): PlannedRaidNode[] {
  return buildFamilyNodes(task, familyId, totalExperts);
}

function buildFamilyNodes(
  task: SanitizedTaskSpec,
  familyId: Parameters<typeof buildContributionWorkstreamAllocations>[0]["familyId"],
  totalExperts: number,
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
      nextProviderIndex,
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
  providerIndexStart: number,
): PlannedRaidNode[] {
  if (template.childFamilyId && assignedExperts > template.roles.length) {
    const childTask = buildScopedTask(parentTask, template, assignedExperts);
    const leadRole = template.roles[0]!;

    return [
      {
        task: childTask,
        contributionPlan: toContributionPlan(template, leadRole, familyTotalExperts, providerIndexStart),
        children: buildFamilyNodes(childTask, template.childFamilyId, assignedExperts),
      },
    ];
  }

  return expandRoles(template, assignedExperts).map((role, index) => ({
    task: buildScopedTask(parentTask, template, 1),
    contributionPlan: toContributionPlan(template, role, familyTotalExperts, providerIndexStart + index),
  }));
}

function buildScopedTask(
  task: SanitizedTaskSpec,
  template: ContributionWorkstreamTemplate,
  numExperts: number,
): SanitizedTaskSpec {
  const primaryType = template.primaryType;
  const artifactTypes: OutputType[] =
    template.artifactTypesOverride ??
    (primaryType === "patch" ? ["patch", "text"] : [primaryType]);
  const perExpertBudget = Number(
    (task.constraints.maxBudgetUsd / Math.max(task.constraints.numExperts, 1)).toFixed(2),
  );

  return {
    ...task,
    language: template.languageOverride ?? task.language,
    framework: template.frameworkOverride === null ? undefined : template.frameworkOverride ?? task.framework,
    output: {
      primaryType,
      artifactTypes,
    },
    constraints: {
      ...task.constraints,
      numExperts,
      maxBudgetUsd: Math.max(perExpertBudget * numExperts, 0.01),
      allowedOutputTypes: artifactTypes,
      requireSpecializations: buildScopedSpecializations(task.constraints.requireSpecializations, template.routeSpecializations),
    },
  };
}

function expandRoles(
  template: ContributionWorkstreamTemplate,
  totalExperts: number,
) {
  return Array.from({ length: Math.max(1, totalExperts) }, (_, index) =>
    template.roles[index] ?? template.roles[index % template.roles.length]!,
  );
}

function toContributionPlan(
  template: ContributionWorkstreamTemplate,
  role: ContributionWorkstreamTemplate["roles"][number],
  totalExperts: number,
  providerIndex: number,
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
  routeSpecializations: string[] | undefined,
): string[] {
  if (!routeSpecializations?.length) {
    return unique(inheritedSpecializations);
  }

  const filteredInherited = inheritedSpecializations.filter(
    (value) => !GAME_ROUTE_SPECIALIZATIONS.has(normalizeCapability(value)),
  );

  return unique([...filteredInherited, ...routeSpecializations]);
}

function normalizeCapability(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

const GAME_ROUTE_SPECIALIZATIONS = new Set([
  "gb-studio",
  "gbstudio",
  "pixel-art",
  "pixel-artist",
  "remotion",
  "video-marketing",
  "video-marketer",
]);
