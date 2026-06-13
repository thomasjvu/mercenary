import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { TIMEOUTS } from '@bossraid/constants';
import { fetchUpstreamJson, isE2eeModelId, isTeeModelId } from './shared.js';
import type {
  MergedUpstreamCatalogModel,
  UpstreamChatResult,
  UpstreamModelRecord,
} from './types.js';

const VENICE_BASE = 'https://api.venice.ai/api/v1';

export async function fetchVeniceUpstreamModels(
  apiKey: string,
  options: { timeoutMs?: number } = {}
): Promise<UpstreamModelRecord[]> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_VENICE_MOCK === '1') {
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

export function mergeVeniceCatalogModels(
  upstreamModels: UpstreamModelRecord[]
): MergedUpstreamCatalogModel[] {
  const upstreamIds = new Set(upstreamModels.map((model) => model.id));

  return INFERENCE_MODEL_CATALOG.filter((entry) => entry.modelProvider === 'venice')
    .map((entry) => {
      const upstreamFound =
        upstreamIds.has(entry.upstreamModelId) || upstreamIds.has(entry.modelId);
      return {
        modelId: entry.modelId,
        displayName: entry.displayName,
        modelProvider: 'venice' as const,
        supported: true,
        upstreamFound,
        teeAttested: entry.teeAttested,
        e2ee: entry.e2ee,
        maxContextTokens: entry.maxContextTokens ?? null,
        referenceInputPer1mUsd: entry.inputPer1mUsd ?? null,
        referenceOutputPer1mUsd: entry.outputPer1mUsd ?? null,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function probeVeniceChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  timeoutMs?: number;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_VENICE_MOCK === '1') {
    return { content: `mock-venice-response:${input.modelId}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUTS.VENICE_TIMEOUT);

  try {
    const response = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: [
          {
            role: 'user',
            content: input.prompt ?? 'Reply with the single word: ok',
          },
        ],
        max_completion_tokens: 16,
      }),
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
}): Promise<Record<string, unknown>> {
  if (process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1') {
    return {
      verified: true,
      nonce: input.nonce,
      model: input.modelId,
      tee_provider: 'venice',
      signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
      intel_quote: 'mock-intel-quote',
    };
  }

  const url = new URL(`${VENICE_BASE}/tee/attestation`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
