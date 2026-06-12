import type { SanitizedTaskSpec } from '@bossraid/shared-types';
import {
  authorContributionFamilyWorkstreams,
  expandRoleTemplates,
  isGameTask,
  selectExpansionTarget,
  taskCanRouteThroughGameWorkstreams,
} from './authoring.js';
import { FAMILIES } from './families/index.js';
import {
  type ContributionFamily,
  type ContributionFamilyId,
  type ContributionRolePlan,
  type ContributionWorkstreamAllocation,
  type ContributionWorkstreamTemplate,
} from './types.js';

export function buildContributionRolePlan(input: {
  task: SanitizedTaskSpec;
  providerIndex: number;
  totalExperts: number;
  providerSpecializations?: string[];
}): ContributionRolePlan {
  const templates = buildContributionRoleSequence({
    task: input.task,
    totalExperts: input.totalExperts,
  });
  const template =
    templates[Math.max(0, input.providerIndex - 1)] ?? templates[templates.length - 1]!;
  const specializationNote =
    input.providerSpecializations != null && input.providerSpecializations.length > 0
      ? `Lean on these strengths when they help: ${input.providerSpecializations.slice(0, 3).join(', ')}.`
      : undefined;

  return {
    id: template.id,
    label: template.label,
    objective: template.objective,
    prompt: [template.prompt, specializationNote].filter(Boolean).join(' '),
    workstreamId: template.workstreamId,
    workstreamLabel: template.workstreamLabel,
    workstreamObjective: template.workstreamObjective,
  };
}

export function buildContributionRoleSequence(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
}): ContributionRolePlan[] {
  const allocations = buildContributionWorkstreamAllocations(input);

  return allocations.flatMap((allocation) =>
    expandRoleTemplates(allocation.template, allocation.assignedExperts).map((role) => ({
      id: role.id,
      label: role.label,
      objective: role.objective,
      prompt: role.prompt,
      workstreamId: allocation.template.id,
      workstreamLabel: allocation.template.label,
      workstreamObjective: allocation.template.objective,
    }))
  );
}

export function buildContributionWorkstreamAllocations(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
  familyId?: ContributionFamilyId;
}): ContributionWorkstreamAllocation[] {
  const family = getContributionFamily(input.familyId ?? getRootContributionFamilyId(input.task));
  const authoredWorkstreams = authorContributionFamilyWorkstreams(input.task, family.workstreams);
  const activeTemplates = authoredWorkstreams.slice(
    0,
    Math.min(Math.max(1, input.totalExperts), authoredWorkstreams.length)
  );
  const allocation = new Map(activeTemplates.map((template) => [template.id, 1]));
  let remaining = Math.max(0, input.totalExperts - activeTemplates.length);

  while (remaining > 0) {
    const next = selectExpansionTarget(activeTemplates, allocation);
    allocation.set(next.id, (allocation.get(next.id) ?? 0) + 1);
    remaining -= 1;
  }

  return activeTemplates.map((template) => ({
    template,
    assignedExperts: allocation.get(template.id) ?? 1,
  }));
}

export function getRootContributionFamilyId(task: SanitizedTaskSpec): ContributionFamilyId {
  if (taskCanRouteThroughGameWorkstreams(task) && isGameTask(task)) {
    return 'game_root';
  }
  return (task.output?.primaryType ?? 'patch') === 'patch' ? 'patch_root' : 'text_root';
}

export function getContributionFamily(familyId: ContributionFamilyId): ContributionFamily {
  return FAMILIES[familyId];
}

export function getContributionWorkstreamTemplate(
  task: SanitizedTaskSpec,
  workstreamId: string
): ContributionWorkstreamTemplate | undefined {
  for (const family of Object.values(FAMILIES)) {
    const authored = authorContributionFamilyWorkstreams(task, family.workstreams).find(
      (template) => template.id === workstreamId
    );
    if (authored) {
      return authored;
    }
  }

  return undefined;
}
