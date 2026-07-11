import type { UpstreamProviderId } from '@bossraid/constants';
import {
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const XAI_BASE = 'https://api.x.ai/v1';
const PROVIDER = 'xai' satisfies UpstreamProviderId;

/** Static fallback when live /models is unavailable (local mock / non-prod failure). */
const MOCK_XAI_MODELS: UpstreamModelRecord[] = [
  {
    id: 'grok-4.5',
    displayName: 'Grok 4.5',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'grok-4-1-fast-reasoning',
    displayName: 'Grok 4.1 Fast Reasoning',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'grok-4-1-fast-non-reasoning',
    displayName: 'Grok 4.1 Fast',
    teeAttested: false,
    e2ee: false,
  },
];

export async function fetchXaiUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_XAI_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<{ id: string; name?: string }> }>(
        `${XAI_BASE}/models`,
        { apiKey }
      );
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.name ?? model.id,
        teeAttested: false,
        e2ee: false,
      }));
    },
  });
}

export async function probeXaiChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${XAI_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-xai-response:${input.modelId}`,
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });
}

/**
 * xAI does not currently expose a public TEE attestation report API comparable to Venice/Phala.
 * Callers should treat xAI offers as api_chat without tee_attested claims.
 */
export async function fetchXaiAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'xAI (Grok) does not publish upstream TEE attestation reports. Use privacy features without tee_attested.'
  );
}
