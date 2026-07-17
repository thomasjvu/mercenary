import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { TIMEOUTS } from '@bossraid/constants';
import { applyChatOptionsToBody, type RaidChatOptions } from '../chat-options.js';
import { isProviderInferenceMock, isProviderTeeMock } from '../upstream-mock.js';
import { buildMockVeniceTeeReport } from './adapter-helpers.js';
import { fetchUpstreamJson, isE2eeModelId, isTeeModelId } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const VENICE_BASE = 'https://api.venice.ai/api/v1';

export async function fetchVeniceUpstreamModels(
  apiKey: string,
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const env = options.env ?? process.env;
  if (isProviderInferenceMock('venice', env)) {
    return INFERENCE_MODEL_CATALOG.filter((entry) => entry.modelProvider === 'venice').map(
      (entry) => ({
        id: entry.upstreamModelId,
        displayName: entry.displayName,
        teeAttested: entry.teeAttested,
        e2ee: entry.e2ee,
      })
    );
  }

  const payload = await fetchUpstreamJson<{
    data?: Array<{ id: string; model_spec?: Record<string, unknown> }>;
  }>(`${VENICE_BASE}/models`, { apiKey, timeoutMs: options.timeoutMs });

  return (payload.data ?? []).map((model) => {
    const capabilities = (model.model_spec?.capabilities ?? {}) as Record<string, unknown>;
    return {
      id: model.id,
      displayName: typeof model.model_spec?.name === 'string' ? model.model_spec.name : model.id,
      teeAttested: isTeeModelId(model.id),
      e2ee: isE2eeModelId(model.id) || capabilities.supportsE2EE === true,
      supportsE2ee: capabilities.supportsE2EE === true,
    };
  });
}

export async function probeVeniceChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  if (isProviderInferenceMock('venice', env)) {
    return { content: `mock-venice-response:${input.modelId}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUTS.VENICE_TIMEOUT);
  const body = applyChatOptionsToBody(
    {
      model: input.modelId,
      messages: [
        {
          role: 'user',
          content: input.prompt ?? 'Reply with the single word: ok',
        },
      ],
      max_completion_tokens: input.chatOptions?.max_tokens ?? 16,
    },
    // Venice prefers max_completion_tokens; still pass temperature / reasoning_effort.
    {
      temperature: input.chatOptions?.temperature,
      reasoning_effort: input.chatOptions?.reasoning_effort,
    }
  );
  // Prefer Venice field name when max_tokens was applied.
  if (typeof body.max_tokens === 'number') {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }

  try {
    const response = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Venice chat request failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      id?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Venice chat response was empty.');
    }
    return { content, requestId: payload.id };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchVeniceAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  if (isProviderTeeMock('venice', env)) {
    return buildMockVeniceTeeReport({ modelId: input.modelId, nonce: input.nonce });
  }

  const url = new URL(`${VENICE_BASE}/tee/attestation`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
