const DEFAULT_REASONING_EFFORT = "medium";
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 20_000;

interface VeniceChatChoice {
  message?: {
    content?: string | null;
  };
}

interface VeniceChatResponse {
  choices?: VeniceChatChoice[];
}

export interface VeniceStructuredRuntime {
  apiBase: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface VeniceStructuredRequest {
  systemPrompt: string;
  userPrompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxCompletionTokens?: number;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const firstNewline = trimmed.indexOf("\n");
  const lastFence = trimmed.lastIndexOf("```");
  if (firstNewline === -1 || lastFence <= firstNewline) {
    return trimmed;
  }

  return trimmed.slice(firstNewline + 1, lastFence).trim();
}

function parseStructuredJson<T>(content: string): T {
  const stripped = stripCodeFence(content);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const objectStart = stripped.indexOf("{");
    const objectEnd = stripped.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(stripped.slice(objectStart, objectEnd + 1)) as T;
    }
    const arrayStart = stripped.indexOf("[");
    const arrayEnd = stripped.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(stripped.slice(arrayStart, arrayEnd + 1)) as T;
    }
    throw new Error("Venice response did not contain parseable JSON.");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestBody(
  request: VeniceStructuredRequest,
  runtime: VeniceStructuredRuntime,
  useSchemaResponseFormat: boolean,
): Record<string, unknown> {
  const schemaPrompt = useSchemaResponseFormat
    ? request.systemPrompt
    : `${request.systemPrompt}\nReturn raw JSON only. It must match this schema exactly:\n${JSON.stringify(request.schema)}`;

  const body: Record<string, unknown> = {
    model: runtime.model,
    reasoning_effort: runtime.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    temperature: request.temperature ?? 0.4,
    max_completion_tokens: request.maxCompletionTokens ?? 900,
    venice_parameters: {
      include_venice_system_prompt: false,
    },
    messages: [
      { role: "system", content: schemaPrompt },
      { role: "user", content: request.userPrompt },
    ],
  };

  if (useSchemaResponseFormat) {
    body.response_format = {
      type: "json_schema",
      json_schema: request.schema,
    };
  }

  return body;
}

export async function generateStructuredWithVenice<T>(
  runtime: VeniceStructuredRuntime,
  request: VeniceStructuredRequest,
): Promise<T> {
  let useSchemaResponseFormat = true;
  let lastError: Error | undefined;
  const maxAttempts = runtime.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${runtime.apiBase.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildRequestBody(request, runtime, useSchemaResponseFormat)),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const payload = (await response.json()) as VeniceChatResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          throw new Error("Venice response did not include assistant content.");
        }
        return parseStructuredJson<T>(content);
      }

      const body = await response.text();
      if (
        useSchemaResponseFormat &&
        response.status === 400 &&
        body.includes("response_format is not supported by this model")
      ) {
        useSchemaResponseFormat = false;
        attempt -= 1;
        continue;
      }

      lastError = new Error(`Venice request failed (${response.status}): ${body}`);
      const retryable =
        response.status === 400 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status === 429 ||
        response.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts) {
        throw lastError;
      }
    }

    await delay(400 * attempt);
  }

  throw lastError ?? new Error("Venice request failed.");
}
