import { clamp01 } from "@bossraid/raid-core";
import type {
  BuildCheckResult,
  HeuristicResult,
  LlmRubricResult,
  ProviderSubmission,
  SanitizedTaskSpec,
  TestCheckResult,
} from "@bossraid/shared-types";

type ResponsesApiPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      json?: unknown;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type RubricConfig = {
  apiBase: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

const RUBRIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    correctness: { type: "number" },
    sideEffectSafety: { type: "number" },
    explanation: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["correctness", "sideEffectSafety", "explanation", "rationale"],
} as const;

function readRubricConfig(env: NodeJS.ProcessEnv = process.env): RubricConfig | null {
  const apiKey = env.BOSSRAID_RUBRIC_MODEL_API_KEY;
  const model = env.BOSSRAID_RUBRIC_MODEL;
  if (!apiKey || !model) {
    return null;
  }

  return {
    apiBase: env.BOSSRAID_RUBRIC_MODEL_API_BASE ?? "https://api.openai.com/v1",
    apiKey,
    model,
    timeoutMs: Number(env.BOSSRAID_RUBRIC_TIMEOUT_MS ?? "20000"),
  };
}

function fallbackRubric(
  task: SanitizedTaskSpec,
  submission: ProviderSubmission,
  build: BuildCheckResult,
  tests: TestCheckResult,
  heuristics: HeuristicResult,
): LlmRubricResult {
  const primaryContent =
    submission.patchUnifiedDiff ??
    submission.answerText ??
    (submission.artifacts ?? [])
      .map((artifact) => [artifact.outputType, artifact.label, artifact.description, artifact.mimeType].filter(Boolean).join(" "))
      .join("\n");
  const explanation = clamp01(0.35 + Math.min(submission.explanation.length, 400) / 800);
  const correctness = clamp01(
    0.25 +
      build.score * 0.25 +
      tests.score * 0.2 +
      heuristics.score * 0.2 +
      submission.confidence * 0.05 +
      clamp01(Math.min(primaryContent.length, 600) / 600) * 0.05,
  );
  const sideEffectSafety = clamp01(
    0.35 +
      (1 - Math.min(heuristics.diffLines, 250) / 250) * 0.25 +
      (heuristics.dangerousPathsTouched ? 0 : 0.2) +
      build.score * 0.2,
  );

  return {
    correctness,
    sideEffectSafety,
    explanation,
    rationale: `Scored for ${task.language} with deterministic build/test signals and explanation quality.`,
  };
}

function extractModelJson(payload: ResponsesApiPayload): unknown {
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return JSON.parse(payload.output_text);
  }

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.refusal) {
        throw new Error(content.refusal);
      }

      if (content.json != null) {
        return content.json;
      }

      if (typeof content.text === "string" && content.text.trim()) {
        return JSON.parse(content.text);
      }
    }
  }

  throw new Error("rubric model did not return structured output");
}

function normalizeRubricResult(result: unknown, fallback: LlmRubricResult): LlmRubricResult {
  if (!result || typeof result !== "object") {
    return fallback;
  }

  const candidate = result as Partial<LlmRubricResult>;
  return {
    correctness:
      typeof candidate.correctness === "number" ? clamp01(candidate.correctness) : fallback.correctness,
    sideEffectSafety:
      typeof candidate.sideEffectSafety === "number"
        ? clamp01(candidate.sideEffectSafety)
        : fallback.sideEffectSafety,
    explanation:
      typeof candidate.explanation === "number" ? clamp01(candidate.explanation) : fallback.explanation,
    rationale:
      typeof candidate.rationale === "string" && candidate.rationale.trim().length > 0
        ? candidate.rationale
        : fallback.rationale,
  };
}

async function scoreWithModel(
  config: RubricConfig,
  task: SanitizedTaskSpec,
  submission: ProviderSubmission,
  build: BuildCheckResult,
  tests: TestCheckResult,
  heuristics: HeuristicResult,
  fallback: LlmRubricResult,
): Promise<LlmRubricResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(new URL("/responses", config.apiBase).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        instructions: [
          "You are an expert code-fix evaluator.",
          "Score correctness, sideEffectSafety, and explanation from 0.0 to 1.0.",
          "Use build, test, heuristic, and patch evidence.",
          "Return only valid JSON matching the supplied schema.",
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  {
                    task: {
                      title: task.taskTitle,
                      description: task.taskDescription,
                      language: task.language,
                      framework: task.framework,
                      expectedBehavior: task.failingSignals.expectedBehavior,
                      observedBehavior: task.failingSignals.observedBehavior,
                    },
                    submission: {
                      patchUnifiedDiff: submission.patchUnifiedDiff,
                      answerText: submission.answerText,
                      artifacts: submission.artifacts,
                      explanation: submission.explanation,
                      claimedRootCause: submission.claimedRootCause,
                    },
                    build,
                    tests,
                    heuristics,
                  },
                  null,
                  2,
                ),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "bossraid_rubric",
            strict: true,
            schema: RUBRIC_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`rubric model request failed (${response.status})`);
    }

    const payload = (await response.json()) as ResponsesApiPayload;
    return normalizeRubricResult(extractModelJson(payload), fallback);
  } finally {
    clearTimeout(timeout);
  }
}

export async function scoreWithRubric(
  task: SanitizedTaskSpec,
  submission: ProviderSubmission,
  build: BuildCheckResult,
  tests: TestCheckResult,
  heuristics: HeuristicResult,
): Promise<LlmRubricResult> {
  const fallback = fallbackRubric(task, submission, build, tests, heuristics);
  const config = readRubricConfig();
  if (!config) {
    return fallback;
  }

  try {
    return await scoreWithModel(config, task, submission, build, tests, heuristics, fallback);
  } catch (error) {
    return {
      ...fallback,
      rationale: `Rubric fallback used: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
