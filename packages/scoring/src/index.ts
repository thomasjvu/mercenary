import {
  DEFAULT_LIMITS,
  clamp01,
  countLines,
  hashSubmission,
} from "@bossraid/raid-core";
import type {
  BuildCheckResult,
  EvaluationBreakdown,
  HeuristicResult,
  OutputType,
  ProviderSubmission,
  RaidRecord,
  SanitizedTaskSpec,
  TestCheckResult,
} from "@bossraid/shared-types";

export function invalid(reason: string, summary?: string): EvaluationBreakdown {
  return {
    schemaPass: false,
    patchApplyPass: false,
    buildScore: 0,
    testScore: 0,
    heuristicScore: 0,
    correctnessRubric: 0,
    sideEffectSafety: 0,
    explanationScore: 0,
    latencyScore: 0,
    uniquenessScore: 0,
    finalScore: 0,
    valid: false,
    invalidReasons: [reason],
    summary,
  };
}

function getPrimarySubmissionContent(submission: ProviderSubmission): string {
  return (
    submission.patchUnifiedDiff ??
    submission.answerText ??
    summarizeArtifacts(submission)
  );
}

function summarizeArtifacts(submission: ProviderSubmission): string {
  return (submission.artifacts ?? [])
    .map((artifact) =>
      [
        artifact.outputType,
        artifact.label,
        artifact.description,
        artifact.mimeType,
        artifact.sha256,
        redactArtifactUri(artifact.uri),
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

function redactArtifactUri(uri: string): string {
  return uri.startsWith("data:") ? "inline-data-uri" : uri;
}

function hasArtifactOfType(
  submission: ProviderSubmission,
  outputType: OutputType,
): boolean {
  return (submission.artifacts ?? []).some((artifact) => artifact.outputType === outputType);
}

const SCORE_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "when",
  "after",
  "before",
  "while",
  "where",
  "does",
  "only",
  "must",
  "should",
  "return",
  "error",
  "line",
  "code",
  "file",
  "files",
  "task",
  "expected",
  "behavior",
]);

function tokenizeForScore(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 4 && !SCORE_STOP_WORDS.has(token));
}

function buildEvidenceTerms(task: SanitizedTaskSpec): string[] {
  const terms = new Set<string>();

  for (const token of [
    ...tokenizeForScore(task.taskTitle),
    ...tokenizeForScore(task.taskDescription),
    ...task.failingSignals.errors.flatMap((item) => tokenizeForScore(item)),
    ...(task.failingSignals.reproSteps ?? []).flatMap((item) => tokenizeForScore(item)),
    ...tokenizeForScore(task.failingSignals.expectedBehavior),
    ...tokenizeForScore(task.failingSignals.observedBehavior),
  ]) {
    terms.add(token);
  }

  return [...terms].slice(0, 16);
}

function computeEvidenceCoverage(task: SanitizedTaskSpec, submission: ProviderSubmission): number {
  const terms = buildEvidenceTerms(task);
  if (terms.length === 0) {
    return 0.5;
  }

  const responseText = [
    submission.answerText,
    submission.explanation,
    submission.claimedRootCause,
    submission.patchUnifiedDiff,
    summarizeArtifacts(submission),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const matched = terms.filter((term) => responseText.includes(term)).length;
  return clamp01(matched / terms.length);
}

export function mergeBuildChecks(
  staticBuild: BuildCheckResult,
  runtimeBuild: BuildCheckResult,
): BuildCheckResult {
  if (
    runtimeBuild.summary.includes("not available") ||
    runtimeBuild.summary.includes("Runtime probe disabled")
  ) {
    return {
      passed: staticBuild.passed,
      score: Math.min(staticBuild.score, 0.45),
      summary: `${staticBuild.summary} Runtime probe unavailable. ${runtimeBuild.summary}`,
    };
  }

  if (!runtimeBuild.passed) {
    return runtimeBuild;
  }

  return runtimeBuild.score >= staticBuild.score ? runtimeBuild : staticBuild;
}

export function parseTouchedFilesFromDiff(diff: string): string[] {
  const matches = [...diff.matchAll(/^\+\+\+\s+b\/(.+)$/gm)];
  return [...new Set(matches.map((match) => match[1]))];
}

export function validateSubmissionSchema(
  task: SanitizedTaskSpec,
  submission: ProviderSubmission,
): string[] {
  const issues: string[] = [];
  const primaryType = task.output?.primaryType ?? "patch";
  const isPatchTask = primaryType === "patch";
  const isTextTask = primaryType === "text" || primaryType === "json";

  if (isPatchTask) {
    if (!submission.patchUnifiedDiff?.includes("@@")) {
      issues.push("missing_hunks");
    }

    if ((submission.patchUnifiedDiff ?? "").trim().length === 0) {
      issues.push("empty_diff");
    }
  } else if (isTextTask && (submission.answerText ?? "").trim().length < 12) {
    issues.push("empty_answer");
  } else if (!isTextTask && !hasArtifactOfType(submission, primaryType)) {
    issues.push("missing_artifact");
  }

  if (submission.explanation.trim().length < 12) {
    issues.push("weak_explanation");
  }

  if (submission.confidence < 0 || submission.confidence > 1) {
    issues.push("bad_confidence");
  }

  const touchedFiles = submission.filesTouched.length > 0
    ? submission.filesTouched
    : parseTouchedFilesFromDiff(submission.patchUnifiedDiff ?? "");

  if (isPatchTask && touchedFiles.length === 0) {
    issues.push("no_touched_files");
  }

  const allowedFiles = new Set(task.files.map((file) => file.path));
  if (isPatchTask && touchedFiles.some((file) => !allowedFiles.has(file))) {
    issues.push("touched_unknown_file");
  }

  return issues;
}

export function runStaticBuildChecks(task: SanitizedTaskSpec, submission: ProviderSubmission): BuildCheckResult {
  const isPatchTask = (task.output?.primaryType ?? "patch") === "patch";
  if (!isPatchTask) {
    return {
      passed: true,
      score: 1,
      summary: "Non-patch response does not require patch build checks.",
    };
  }

  const diffLines = countLines(submission.patchUnifiedDiff ?? "");
  const oversized = diffLines > (task.constraints.maxDiffLines ?? DEFAULT_LIMITS.maxDiffLines);
  const forbiddenPaths = task.constraints.forbidPaths ?? [];
  const touchedForbidden = submission.filesTouched.some((file) =>
    forbiddenPaths.some((forbid) => file.startsWith(forbid)),
  );

  if (touchedForbidden) {
    return {
      passed: false,
      score: 0,
      summary: "Touched forbidden path.",
    };
  }

  if (oversized) {
    return {
      passed: false,
      score: 0.2,
      summary: "Patch exceeds diff line budget.",
    };
  }

  const score =
    (submission.patchUnifiedDiff ?? "").includes("+") && (submission.patchUnifiedDiff ?? "").includes("-") ? 0.8 : 0.55;
  return {
    passed: score >= 0.4,
    score,
    summary: `Static patch sanity passed for ${task.language}.`,
  };
}

export function runProxyTestChecks(task: SanitizedTaskSpec, submission: ProviderSubmission): TestCheckResult {
  const primaryType = task.output?.primaryType ?? "patch";
  const isPatchTask = primaryType === "patch";
  const isTextTask = primaryType === "text" || primaryType === "json";
  const declaredTests = task.failingSignals.tests?.length ?? 0;
  const reproCount = task.failingSignals.reproSteps?.length ?? 0;
  const evidenceCoverage = computeEvidenceCoverage(task, submission);
  const explanationStrength = clamp01(submission.explanation.trim().length / 220);

  if (!isPatchTask) {
    const answerLengthScore = clamp01(Math.min((submission.answerText ?? "").length, 800) / 800);
    const artifactPresence = hasArtifactOfType(submission, primaryType) ? 1 : (submission.artifacts?.length ?? 0) > 0 ? 0.7 : 0;
    const answerScore = isTextTask
      ? clamp01(
          0.2 +
            0.4 * evidenceCoverage +
            0.2 * explanationStrength +
            0.2 * answerLengthScore,
        )
      : clamp01(
          0.25 +
            0.35 * evidenceCoverage +
            0.2 * explanationStrength +
            0.2 * artifactPresence,
        );
    return {
      passed: answerScore >= 0.55 ? 1 : 0,
      failed: answerScore >= 0.55 ? 0 : 1,
      score: answerScore,
      summary: isTextTask
        ? "Text response scored with deterministic evidence and explanation checks."
        : "Artifact response scored with deterministic artifact, evidence, and explanation checks.",
    };
  }

  if (declaredTests > 0) {
    const touchedFiles = submission.filesTouched.length > 0
      ? submission.filesTouched.length
      : parseTouchedFilesFromDiff(submission.patchUnifiedDiff ?? "").length;
    const regressionScore = clamp01(
      0.25 +
        0.45 * evidenceCoverage +
        0.15 * explanationStrength +
        0.15 * clamp01(touchedFiles / Math.max(Math.min(declaredTests, 3), 1)),
    );
    const passed = regressionScore >= 0.55 ? declaredTests : 0;
    const failed = Math.max(declaredTests - passed, 0);
    return {
      passed,
      failed,
      score: regressionScore,
      summary: "Regression hints scored with deterministic evidence checks.",
    };
  }

  const heuristicScore = clamp01(
    0.3 +
      0.4 * evidenceCoverage +
      0.2 * explanationStrength +
      0.1 * clamp01(Math.min(reproCount, 3) / 3),
  );
  return {
    passed: heuristicScore >= 0.55 ? 1 : 0,
    failed: heuristicScore >= 0.55 ? 0 : 1,
    score: heuristicScore,
    summary: "No regression hints supplied; used deterministic evidence proxy.",
  };
}

export function runHeuristics(
  task: SanitizedTaskSpec,
  submission: ProviderSubmission,
  touchedFiles: string[],
  duplicateOfProviderId?: string,
): HeuristicResult {
  const primaryType = task.output?.primaryType ?? "patch";
  const isPatchTask = primaryType === "patch";
  const isTextTask = primaryType === "text" || primaryType === "json";
  const diffLines = countLines(getPrimarySubmissionContent(submission));
  const dangerousPathsTouched = touchedFiles.some((file) =>
    (task.constraints.forbidPaths ?? []).some((forbid) => file.startsWith(forbid)),
  );
  const issues: string[] = [];
  let score = 1;

  if (isPatchTask && (submission.patchUnifiedDiff ?? "").replace(/[-+\s@]/g, "").length < 10) {
    score -= 0.35;
    issues.push("possible_noop_patch");
  }

  if (!isPatchTask && isTextTask && (submission.answerText ?? "").trim().length < 40) {
    score -= 0.25;
    issues.push("thin_text_answer");
  }

  if (!isPatchTask && !isTextTask && !hasArtifactOfType(submission, primaryType)) {
    score -= 0.35;
    issues.push("artifact_type_missing");
  }

  if (dangerousPathsTouched) {
    score -= 0.5;
    issues.push("forbidden_path_touched");
  }

  if (diffLines > (task.constraints.maxDiffLines ?? DEFAULT_LIMITS.maxDiffLines)) {
    score -= 0.3;
    issues.push("oversized_patch");
  }

  if (touchedFiles.length > (task.constraints.maxChangedFiles ?? 4)) {
    score -= 0.25;
    issues.push("too_many_files_changed");
  }

  if (duplicateOfProviderId) {
    score -= 0.5;
    issues.push("duplicate_submission");
  }

  if (submission.claimedRootCause && submission.explanation.includes(submission.claimedRootCause)) {
    score += 0.1;
  }

  return {
    score: clamp01(score),
    diffLines,
    touchedFiles: touchedFiles.length,
    dangerousPathsTouched,
    duplicateOfProviderId,
    issues,
  };
}

export function computeFinalScore(input: {
  buildScore: number;
  testScore: number;
  heuristicScore: number;
  correctnessRubric: number;
  sideEffectSafety: number;
  explanationScore: number;
  latencyScore: number;
  uniquenessScore: number;
  hasTests: boolean;
}): number {
  if (input.hasTests) {
    return clamp01(
      0.4 * input.testScore +
        0.2 * input.buildScore +
        0.15 * input.correctnessRubric +
        0.1 * input.sideEffectSafety +
        0.05 * input.explanationScore +
        0.05 * input.latencyScore +
        0.05 * input.uniquenessScore,
    );
  }

  return clamp01(
    0.25 * input.buildScore +
      0.25 * input.heuristicScore +
      0.25 * input.correctnessRubric +
      0.15 * input.sideEffectSafety +
      0.1 * input.explanationScore,
  );
}

export function findDuplicateProvider(
  raid: RaidRecord,
  submission: ProviderSubmission,
): string | undefined {
  const primaryContent = getPrimarySubmissionContent(submission);
  const submissionHash = hashSubmission(primaryContent, submission.explanation);

  for (const existing of raid.rankedSubmissions) {
    const existingHash = hashSubmission(
      getPrimarySubmissionContent(existing.submission),
      existing.submission.explanation,
    );
    if (existingHash === submissionHash) {
      return existing.submission.providerId;
    }
  }

  return undefined;
}

export { scoreWithRubric } from "./rubric.js";
