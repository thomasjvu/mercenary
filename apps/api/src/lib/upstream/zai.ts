import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import {
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const PROVIDER = 'zai' satisfies UpstreamProviderId;
const ZAI_BASE = UPSTREAM_PROVIDER_CONFIG.zai.upstreamBase;

const MOCK_ZAI_MODELS: UpstreamModelRecord[] = [
  {
    id: 'glm-4.7',
    displayName: 'GLM 4.7',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'glm-5-turbo',
    displayName: 'GLM 5 Turbo',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'glm-5.2',
    displayName: 'GLM 5.2',
    teeAttested: false,
    e2ee: false,
  },
];

export async function fetchZaiUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const base = options.env?.BOSSRAID_ZAI_API_BASE?.trim().replace(/\/+$/u, '') || ZAI_BASE;
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_ZAI_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<{ id: string; name?: string }> }>(
        `${base}/models`,
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

export async function probeZaiChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const base = env.BOSSRAID_ZAI_API_BASE?.trim().replace(/\/+$/u, '') || ZAI_BASE;
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${base}/chat/completions`,
    env,
    mockContent: `mock-zai-response:${input.modelId}`,
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });
}

export async function fetchZaiAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'Z.ai (GLM) does not publish upstream TEE attestation reports. Use privacy features without tee_attested.'
  );
}
