import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import {
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const PROVIDER = 'anthropic' satisfies UpstreamProviderId;
const ANTHROPIC_BASE = UPSTREAM_PROVIDER_CONFIG.anthropic.upstreamBase;

const MOCK_ANTHROPIC_MODELS: UpstreamModelRecord[] = [
  {
    id: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    teeAttested: false,
    e2ee: false,
  },
];

// Catalog modelIds are anthropic/*; live /models returns bare Anthropic ids (matched via catalog-merge).

export async function fetchAnthropicUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const base =
    options.env?.BOSSRAID_ANTHROPIC_API_BASE?.trim().replace(/\/+$/u, '') || ANTHROPIC_BASE;
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_ANTHROPIC_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{
        data?: Array<{ id: string; display_name?: string }>;
      }>(`${base}/models`, {
        apiKey,
        headers: {
          'anthropic-version': '2023-06-01',
        },
      });
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.display_name ?? model.id,
        teeAttested: false,
        e2ee: false,
      }));
    },
  });
}

export async function probeAnthropicChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const base = env.BOSSRAID_ANTHROPIC_API_BASE?.trim().replace(/\/+$/u, '') || ANTHROPIC_BASE;
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${base}/chat/completions`,
    env,
    mockContent: `mock-anthropic-response:${input.modelId}`,
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });
}

/**
 * Anthropic does not publish a Boss Raid–compatible public TEE attestation report API.
 * Treat Claude offers as api_chat / agent_harness without tee_attested claims.
 */
export async function fetchAnthropicAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'Anthropic (Claude) does not publish upstream TEE attestation reports. Use privacy features without tee_attested.'
  );
}
