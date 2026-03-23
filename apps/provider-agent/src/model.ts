import type { ProviderTaskPackage } from "@bossraid/shared-types";
import { providerConfig } from "./config.js";
import {
  attachContributionRole,
  maybeRequestSpecializedSubmission,
  submissionSupportsRequestedOutput,
} from "./specialized.js";
import { generateStructuredWithVenice } from "./venice.js";
import type { ModelSubmission, ResponsesApiPayload } from "./types.js";

const SUBMISSION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    patchUnifiedDiff: { type: "string" },
    answerText: { type: "string" },
    artifacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          outputType: { type: "string" },
          label: { type: "string" },
          uri: { type: "string" },
          mimeType: { type: "string" },
          description: { type: "string" },
          sha256: { type: "string" },
        },
        required: ["outputType", "label", "uri"],
      },
    },
    explanation: { type: "string" },
    confidence: { type: "number" },
    claimedRootCause: { type: ["string", "null"] },
    filesTouched: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

function buildTaskPrompt(task: ProviderTaskPackage): string {
  const wantsPatch = task.desiredOutput.primaryType === "patch";
  const wantsArtifact =
    task.desiredOutput.primaryType === "image" ||
    task.desiredOutput.primaryType === "video" ||
    task.desiredOutput.primaryType === "bundle";
  const synthesisLines = task.synthesis
      ? [
        "This Boss Raid run uses multi-agent synthesis under Mercenary orchestration.",
        `You are contributor ${task.synthesis.providerIndex} of ${task.synthesis.totalExperts}.`,
        `Assigned workstream: ${task.synthesis.workstreamLabel}.`,
        `Workstream objective: ${task.synthesis.workstreamObjective}`,
        `Assigned role: ${task.synthesis.roleLabel}.`,
        `Role objective: ${task.synthesis.roleObjective}`,
        `Focus: ${task.synthesis.focus}`,
        ...task.synthesis.guidance.map((item) => `- ${item}`),
        "",
      ]
    : [];
  return [
    wantsPatch
      ? "Produce a unified diff and short explanation for this coding task."
      : wantsArtifact
        ? "Produce artifact references and a short explanation for this task."
        : "Produce a text-first answer and short explanation for this task.",
    wantsPatch
      ? "Only patch files included in artifacts.files."
      : wantsArtifact
        ? "Return artifacts with outputType, label, and uri. Use public URLs or data URIs when needed."
        : "Return a direct answer that matches the requested output type.",
    "Do not invent files, dependencies, or commands.",
    wantsPatch
      ? "If the bug cannot be fixed safely from the provided context, return the best constrained patch you can justify."
      : "If the task is underspecified, answer with the most useful constrained result you can justify.",
    ...synthesisLines,
    "",
    JSON.stringify(task, null, 2),
  ].join("\n");
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

  throw new Error("model response did not contain structured output");
}

function parseTouchedFilesFromDiff(diff: string): string[] {
  return [...new Set([...diff.matchAll(/^\+\+\+\s+b\/(.+)$/gm)].map((match) => match[1]))];
}

function providerUsesVeniceChatCompletions(): boolean {
  return providerConfig.modelApiBase.toLowerCase().includes("venice.ai");
}

function normalizeSubmission(result: unknown, task: ProviderTaskPackage): ModelSubmission {
  if (!result || typeof result !== "object") {
    throw new Error("model output was not an object");
  }

  const candidate = result as Partial<ModelSubmission>;
  const wantsPatch = task.desiredOutput.primaryType === "patch";
  const wantsArtifact =
    task.desiredOutput.primaryType === "image" ||
    task.desiredOutput.primaryType === "video" ||
    task.desiredOutput.primaryType === "bundle";
  const rawExplanation = typeof candidate.explanation === "string" ? candidate.explanation.trim() : "";
  const rawAnswerText = typeof candidate.answerText === "string" ? candidate.answerText.trim() : "";
  const explanation = rawExplanation.length >= 12 ? rawExplanation : rawAnswerText.length >= 12 ? rawAnswerText : undefined;
  const answerText =
    wantsPatch || wantsArtifact
      ? undefined
      : rawAnswerText.length >= 12
        ? rawAnswerText
        : explanation;

  if (!explanation) {
    throw new Error("model output is missing a valid explanation");
  }

  if (wantsPatch) {
    if (typeof candidate.patchUnifiedDiff !== "string" || candidate.patchUnifiedDiff.trim().length === 0) {
      throw new Error("model output is missing patchUnifiedDiff");
    }
  } else if (wantsArtifact) {
    if (!Array.isArray(candidate.artifacts) || candidate.artifacts.length === 0) {
      throw new Error("model output is missing artifacts");
    }
  } else if (!answerText) {
    throw new Error("model output is missing answerText");
  }

  const confidence =
    typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? Math.max(0, Math.min(1, candidate.confidence))
      : 0.65;

  const knownFiles = new Set(task.artifacts.files.map((file) => file.path));
  const parsedFiles = Array.isArray(candidate.filesTouched)
    ? candidate.filesTouched.filter((file): file is string => typeof file === "string")
    : [];
  const diffFiles = typeof candidate.patchUnifiedDiff === "string" ? parseTouchedFilesFromDiff(candidate.patchUnifiedDiff) : [];
  const filesTouched = [...new Set([...parsedFiles, ...diffFiles])].filter((file) => knownFiles.has(file));

  if (wantsPatch && filesTouched.length === 0) {
    throw new Error("model output did not reference any known files");
  }

  return attachContributionRole({
    patchUnifiedDiff: wantsPatch ? candidate.patchUnifiedDiff : undefined,
    answerText,
    artifacts:
      Array.isArray(candidate.artifacts)
        ? candidate.artifacts.filter(
            (artifact): artifact is NonNullable<ModelSubmission["artifacts"]>[number] =>
              artifact != null &&
              typeof artifact === "object" &&
              typeof artifact.outputType === "string" &&
              typeof artifact.label === "string" &&
              typeof artifact.uri === "string",
          )
        : undefined,
    explanation,
    confidence,
    claimedRootCause: typeof candidate.claimedRootCause === "string" ? candidate.claimedRootCause : undefined,
    filesTouched: wantsPatch ? filesTouched : [],
  }, task);
}

export async function requestModelSubmission(
  task: ProviderTaskPackage,
  deadlineUnix: number,
): Promise<ModelSubmission> {
  const specialized = await maybeRequestSpecializedSubmission(task);
  if (specialized && submissionSupportsRequestedOutput(specialized, task)) {
    return attachContributionRole(specialized, task);
  }

  if (!providerConfig.modelApiKey || !providerConfig.modelName) {
    throw new Error("provider is not configured with BOSSRAID_MODEL_API_KEY and BOSSRAID_MODEL");
  }

  const timeRemainingMs = Math.max(deadlineUnix * 1000 - Date.now() - 1000, 1_000);
  const timeoutMs = Math.min(providerConfig.modelTimeoutMs, timeRemainingMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (providerUsesVeniceChatCompletions()) {
      const veniceSubmission = await generateStructuredWithVenice<ModelSubmission>(
        {
          apiBase: providerConfig.modelApiBase,
          apiKey: providerConfig.modelApiKey,
          model: providerConfig.modelName,
          reasoningEffort: providerConfig.modelReasoningEffort,
          timeoutMs: Math.min(timeoutMs, 20_000),
        },
        {
          systemPrompt: [
            "You are an external provider participating in a Boss Raid run.",
            "Mercenary will synthesize the final result from approved provider contributions.",
            providerConfig.providerInstructions,
            "Return only valid JSON matching the supplied schema.",
            task.desiredOutput.primaryType === "patch"
              ? "The patch must be a unified diff that applies to the provided files."
              : task.desiredOutput.primaryType === "image" ||
                  task.desiredOutput.primaryType === "video" ||
                  task.desiredOutput.primaryType === "bundle"
                ? "Return artifacts for the requested media output. Use answerText only when the task explicitly asks for text."
                : "Return a direct answer in answerText. Use patchUnifiedDiff only for patch tasks.",
          ].join("\n"),
          userPrompt: buildTaskPrompt(task),
          schema: SUBMISSION_SCHEMA,
          maxCompletionTokens: providerConfig.maxOutputTokens,
        },
      );
      return normalizeSubmission(veniceSubmission, task);
    }

    const response = await fetch(new URL("/responses", providerConfig.modelApiBase).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${providerConfig.modelApiKey}`,
      },
      body: JSON.stringify({
        model: providerConfig.modelName,
        instructions: [
          "You are an external provider participating in a Boss Raid run.",
          "Mercenary will synthesize the final result from approved provider contributions.",
          providerConfig.providerInstructions,
          "Return only valid JSON matching the supplied schema.",
          task.desiredOutput.primaryType === "patch"
            ? "The patch must be a unified diff that applies to the provided files."
            : task.desiredOutput.primaryType === "image" ||
                task.desiredOutput.primaryType === "video" ||
                task.desiredOutput.primaryType === "bundle"
              ? "Return artifacts for the requested media output. Use answerText only when the task explicitly asks for text."
              : "Return a direct answer in answerText. Use patchUnifiedDiff only for patch tasks.",
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildTaskPrompt(task),
              },
            ],
          },
        ],
        max_output_tokens: providerConfig.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "bossraid_submission",
            strict: true,
            schema: SUBMISSION_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`model request failed (${response.status})`);
    }

    const payload = (await response.json()) as ResponsesApiPayload;
    return normalizeSubmission(extractModelJson(payload), task);
  } finally {
    clearTimeout(timeout);
  }
}
