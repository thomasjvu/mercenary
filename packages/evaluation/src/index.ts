import { DEFAULT_LIMITS, countLines, estimateLatencyScore } from "@bossraid/raid-core";
import {
  cleanupWorkspace,
  materializePatchedWorkspace,
  runRuntimeProbes,
} from "@bossraid/sandbox-runner";
import {
  computeFinalScore,
  findDuplicateProvider,
  invalid,
  mergeBuildChecks,
  runHeuristics,
  runProxyTestChecks,
  runStaticBuildChecks,
  scoreWithRubric,
  validateSubmissionSchema,
} from "@bossraid/scoring";
import type {
  BuildCheckResult,
  EvaluationBreakdown,
  ProviderSubmission,
  RaidRecord,
  TestCheckResult,
} from "@bossraid/shared-types";

function resolveTestChecks(input: {
  raid: RaidRecord;
  submission: ProviderSubmission;
  runtimeTests: TestCheckResult;
}): TestCheckResult {
  const proxyTests = runProxyTestChecks(input.raid.task, input.submission);
  const runtimeProbeUnavailable =
    input.runtimeTests.summary.includes("not available") ||
    input.runtimeTests.summary.includes("Runtime probe disabled");

  if (runtimeProbeUnavailable) {
    return {
      ...proxyTests,
      summary: `${proxyTests.summary} ${input.runtimeTests.summary}`.trim(),
    };
  }

  if ((input.raid.task.failingSignals.tests?.length ?? 0) > 0) {
    return input.runtimeTests;
  }

  return input.runtimeTests.score >= proxyTests.score ? input.runtimeTests : proxyTests;
}

export async function evaluateSubmission(
  raid: RaidRecord,
  submission: ProviderSubmission,
): Promise<EvaluationBreakdown> {
  const schemaIssues = validateSubmissionSchema(raid.task, submission);
  if (schemaIssues.length > 0) {
    return invalid(schemaIssues.join(","), "Submission schema validation failed.");
  }

  const isPatchTask = (raid.task.output?.primaryType ?? "patch") === "patch";
  const patchApply = isPatchTask
    ? await materializePatchedWorkspace(raid.task, submission.patchUnifiedDiff ?? "")
    : {
        ok: true,
        workspacePath: "",
        touchedFiles: submission.filesTouched,
        diffLines: countLines(submission.answerText ?? ""),
      };

  if (!patchApply.ok) {
    return invalid("patch_apply_failed", patchApply.error ?? "Patch did not map cleanly onto the provided files.");
  }

  try {
    const duplicateOfProviderId = findDuplicateProvider(raid, submission);
    const staticBuild = runStaticBuildChecks(raid.task, submission);
    const runtimeProbes = isPatchTask
      ? await runRuntimeProbes(raid.task, patchApply.workspacePath, patchApply.touchedFiles)
      : {
          build: { passed: true, score: 1, summary: "No build probe required for non-patch output." },
          tests: { passed: 0, failed: 0, score: 0, summary: "No runtime tests for non-patch output." },
        };
    const runtimeBuild = runtimeProbes.build;
    const build: BuildCheckResult = mergeBuildChecks(staticBuild, runtimeBuild);
    const runtimeTests = runtimeProbes.tests;
    const tests = resolveTestChecks({ raid, submission, runtimeTests });
    const heuristics = runHeuristics(raid.task, submission, patchApply.touchedFiles, duplicateOfProviderId);
    const rubric = await scoreWithRubric(raid.task, submission, build, tests, heuristics);

    const latencyScore = estimateLatencyScore(
      Math.max(Date.parse(submission.submittedAt) - Date.parse(raid.createdAt), 0),
      raid.task.constraints.maxLatencySec,
    );
    const uniquenessScore = duplicateOfProviderId ? 0 : 1;
    const finalScore = computeFinalScore({
      buildScore: build.score,
      testScore: tests.score,
      heuristicScore: heuristics.score,
      correctnessRubric: rubric.correctness,
      sideEffectSafety: rubric.sideEffectSafety,
      explanationScore: rubric.explanation,
      latencyScore,
      uniquenessScore,
      hasTests: (raid.task.failingSignals.tests?.length ?? 0) > 0,
    });

    const invalidReasons: string[] = [];
    if (!build.passed || build.score < 0.4) {
      invalidReasons.push("build_below_threshold");
    }
    if (uniquenessScore === 0) {
      invalidReasons.push("duplicate_submission");
    }
    if (heuristics.dangerousPathsTouched) {
      invalidReasons.push("forbidden_path_touched");
    }
    if (finalScore < DEFAULT_LIMITS.validThreshold) {
      invalidReasons.push("below_threshold");
    }

    return {
      schemaPass: true,
      patchApplyPass: true,
      buildScore: build.score,
      testScore: tests.score,
      heuristicScore: heuristics.score,
      correctnessRubric: rubric.correctness,
      sideEffectSafety: rubric.sideEffectSafety,
      explanationScore: rubric.explanation,
      latencyScore,
      uniquenessScore,
      finalScore,
      valid: invalidReasons.length === 0,
      invalidReasons,
      summary: [
        build.summary,
        tests.summary,
        rubric.rationale,
        heuristics.issues.length > 0 ? `Heuristics: ${heuristics.issues.join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } finally {
    if (isPatchTask && patchApply.workspacePath) {
      await cleanupWorkspace(patchApply.workspacePath);
    }
  }
}
