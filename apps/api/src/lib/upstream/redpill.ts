import type { UpstreamProviderId } from '@bossraid/constants';
import { isE2eeModelId, isTeeModelId } from './shared.js';
import {
  buildMockRedpillTeeReport,
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
  shouldUseTeeMock,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const REDPILL_BASE = 'https://api.redpill.ai/v1';
const PROVIDER = 'redpill' satisfies UpstreamProviderId;

const MOCK_REDPILL_MODELS: UpstreamModelRecord[] = [
  {
    id: 'phala/gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored',
    teeAttested: true,
    e2ee: false,
  },
];

export async function fetchRedpillUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_REDPILL_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<{ id: string; name?: string }> }>(
        `${REDPILL_BASE}/models`,
        { apiKey }
      );
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.name ?? model.id,
        teeAttested: isTeeModelId(model.id),
        e2ee: isE2eeModelId(model.id),
      }));
    },
  });
}

export async function probeRedpillChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${REDPILL_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-redpill-response:${input.modelId}`,
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });
}

export async function fetchRedpillAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  signingAddress?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  if (shouldUseTeeMock(PROVIDER, env)) {
    return buildMockRedpillTeeReport({ nonce: input.nonce });
  }

  const url = new URL(`${REDPILL_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  if (input.signingAddress) {
    url.searchParams.set('signing_address', input.signingAddress);
  }
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
