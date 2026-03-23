import type {
  OutputType,
  ProviderTaskPackage,
  RaidContributionPlan,
  SanitizedTaskSpec,
} from "@bossraid/shared-types";
import { buildContributionRolePlan } from "./partition.js";

export function buildProviderTaskPackage(
  raidId: string,
  task: SanitizedTaskSpec,
  providerContext?: {
    deadlineUnix?: number;
    providerIndex: number;
    totalExperts: number;
    providerSpecializations?: string[];
    contributionPlan?: RaidContributionPlan;
  },
): ProviderTaskPackage {
  const primaryType = task.output?.primaryType ?? "patch";
  const artifactTypes = task.output?.artifactTypes ?? (primaryType === "patch" ? ["patch", "text"] : [primaryType]);
  const providerIndex = providerContext?.providerIndex;
  const totalExperts = providerContext?.totalExperts;
  const specializationNote =
    providerContext?.providerSpecializations != null && providerContext.providerSpecializations.length > 0
      ? `Lean on these strengths when they help: ${providerContext.providerSpecializations.slice(0, 3).join(", ")}.`
      : undefined;
  const rolePlan =
    providerContext == null
      ? undefined
      : providerContext.contributionPlan != null
        ? {
            id: providerContext.contributionPlan.roleId,
            label: providerContext.contributionPlan.roleLabel,
            objective: providerContext.contributionPlan.roleObjective,
            prompt: [providerContext.contributionPlan.prompt, specializationNote].filter(Boolean).join(" "),
            workstreamId: providerContext.contributionPlan.workstreamId,
            workstreamLabel: providerContext.contributionPlan.workstreamLabel,
            workstreamObjective: providerContext.contributionPlan.workstreamObjective,
          }
      : buildContributionRolePlan({
          task,
          providerIndex: providerContext.providerIndex,
          totalExperts: providerContext.totalExperts,
          providerSpecializations: providerContext.providerSpecializations,
        });
  return {
    raidId,
    submissionFormat:
      primaryType === "patch"
        ? "unified_diff_plus_explanation"
        : primaryType === "text" || primaryType === "json"
          ? "text_answer_plus_explanation"
          : "artifact_plus_explanation",
    desiredOutput: {
      primaryType,
      artifactTypes,
    },
    task: {
      title: task.taskTitle,
      description: buildRoleScopedDescription(task.taskDescription, rolePlan),
      language: task.language,
      framework: task.framework,
    },
    artifacts: {
      files: task.files,
      errors: task.failingSignals.errors,
      reproSteps: task.failingSignals.reproSteps ?? [],
      tests: task.failingSignals.tests ?? [],
      expectedBehavior: task.failingSignals.expectedBehavior,
      observedBehavior: task.failingSignals.observedBehavior,
    },
    constraints: {
      maxChangedFiles: task.constraints.maxChangedFiles ?? 4,
      maxDiffLines: task.constraints.maxDiffLines ?? 250,
      forbidPaths: task.constraints.forbidPaths ?? [],
      mustNot: ["delete core systems", "introduce external dependency"],
    },
    synthesis:
      rolePlan == null || providerIndex == null || totalExperts == null
        ? undefined
        : {
            mode: "multi_agent_synthesis",
            role: "contributor",
            totalExperts,
            providerIndex,
            workstreamId: rolePlan.workstreamId,
            workstreamLabel: rolePlan.workstreamLabel,
            workstreamObjective: rolePlan.workstreamObjective,
            roleId: rolePlan.id,
            roleLabel: rolePlan.label,
            roleObjective: rolePlan.objective,
            focus: rolePlan.prompt,
            guidance: buildContributionGuidance(primaryType),
          },
    deadlineUnix:
      providerContext?.deadlineUnix ?? Math.floor(Date.now() / 1_000) + task.constraints.maxLatencySec,
  };
}

function buildRoleScopedDescription(
  description: string,
  rolePlan:
    | {
        workstreamLabel: string;
        workstreamObjective: string;
        label: string;
        objective: string;
        prompt: string;
      }
    | undefined,
): string {
  if (!rolePlan) {
    return description;
  }

  return [
    description,
    `Assigned workstream: ${rolePlan.workstreamLabel}.`,
    `Workstream objective: ${rolePlan.workstreamObjective}`,
    `Assigned sub-role: ${rolePlan.label}.`,
    `Role objective: ${rolePlan.objective}`,
    `Role brief: ${rolePlan.prompt}`,
  ].join("\n\n");
}

function buildContributionGuidance(primaryType: OutputType): string[] {
  return [
    "Mercenary will synthesize the final result from approved provider contributions.",
    primaryType === "patch"
      ? "Prefer diffs that are minimal, safe, and easy to reconcile with adjacent provider work."
      : primaryType === "text" || primaryType === "json"
        ? "Prefer concise answers that are easy to blend with other expert signals."
        : "Prefer artifact refs that are easy for the receipt to preview, plus the shortest explanation needed to place them.",
    "If the task is under-scoped, state the limit directly instead of inventing missing context.",
  ];
}
