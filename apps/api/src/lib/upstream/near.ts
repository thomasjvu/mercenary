import type { UpstreamProviderId } from '@bossraid/constants';
import { isE2eeModelId } from './shared.js';
import {
  buildMockNearTeeReport,
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
  shouldUseTeeMock,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const NEAR_BASE = 'https://cloud-api.near.ai/v1';
const PROVIDER = 'near' satisfies UpstreamProviderId;

const MOCK_NEAR_MODELS: UpstreamModelRecord[] = [
  {
    id: 'zai-org/GLM-5.1-FP8',
    displayName: 'GLM 5.1 FP8',
    teeAttested: true,
    e2ee: true,
  },
];

export async function fetchNearUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_NEAR_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<{ id: string }> }>(
        `${NEAR_BASE}/models`,
        { apiKey }
      );
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.id,
        teeAttested: true,
        e2ee: isE2eeModelId(model.id),
      }));
    },
  });
}

export async function probeNearChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${NEAR_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-near-response:${input.modelId}`,
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });
}

export async function fetchNearAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  signingAlgo?: 'ecdsa' | 'ed25519';
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  if (shouldUseTeeMock(PROVIDER, env)) {
    return buildMockNearTeeReport({ nonce: input.nonce });
  }

  const url = new URL(`${NEAR_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('signing_algo', input.signingAlgo ?? 'ecdsa');
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
