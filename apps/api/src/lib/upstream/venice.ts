import { readUpstreamUsage } from './usage.js';
import { TIMEOUTS } from '@bossraid/constants';
import {
  applyChatOptionsToBody,
  resolveChatMessagesForUpstream,
  type RaidChatOptions,
} from '../chat-options.js';
import { isProviderInferenceMock, isProviderTeeMock } from '../upstream-mock.js';
import { buildMockVeniceTeeReport } from './adapter-helpers.js';
import { fetchUpstreamJson, isE2eeModelId, isTeeModelId } from './shared.js';
import type { UpstreamChatResult } from './types.js';

const VENICE_BASE = 'https://api.venice.ai/api/v1';

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
      messages: resolveChatMessagesForUpstream({
        prompt: input.prompt,
        chatOptions: input.chatOptions,
      }),
      max_completion_tokens: input.chatOptions?.max_tokens ?? 16,
    },
    // Venice prefers max_completion_tokens; still pass temperature / reasoning_effort / messages.
    {
      temperature: input.chatOptions?.temperature,
      reasoning_effort: input.chatOptions?.reasoning_effort,
      messages: input.chatOptions?.messages,
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
      usage?: unknown;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Venice chat response was empty.');
    }
    return { content, requestId: payload.id, usage: readUpstreamUsage(payload.usage) };
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
