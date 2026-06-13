import type { UpstreamProviderId } from '@bossraid/constants';
import {
  buildMockChutesTeeEvidence,
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
  shouldUseTeeMock,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const CHUTES_BASE = 'https://api.chutes.ai';
const PROVIDER = 'chutes' satisfies UpstreamProviderId;

const MOCK_CHUTES_MODELS: UpstreamModelRecord[] = [
  {
    id: 'tee-qwen3-5-122b',
    displayName: 'TEE Qwen3.5 122B',
    teeAttested: true,
    e2ee: false,
  },
];

export async function fetchChutesUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_CHUTES_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{
        data?: Array<{ id: string; name?: string; tee?: boolean }>;
      }>(`${CHUTES_BASE}/chutes`, { apiKey });
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.name ?? model.id,
        teeAttested: model.tee === true || model.id.toLowerCase().includes('tee'),
        e2ee: false,
      }));
    },
  });
}

export async function probeChutesChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  const result = await probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${CHUTES_BASE}/chutes/${encodeURIComponent(input.modelId)}/chat/completions`,
    env: input.env,
    mockContent: `mock-chutes-response:${input.modelId}`,
    mockExtras: { instanceId: 'mock-instance' },
    body: {
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
      stream: false,
    },
  });
  return { ...result, instanceId: result.instanceId ?? result.requestId };
}

export async function fetchChutesAttestationEvidence(input: {
  apiKey: string;
  instanceId: string;
  nonce: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  if (shouldUseTeeMock(PROVIDER, env)) {
    return buildMockChutesTeeEvidence({ nonce: input.nonce });
  }

  const url = new URL(`${CHUTES_BASE}/instances/${encodeURIComponent(input.instanceId)}/evidence`);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
