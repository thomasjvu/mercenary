import type { UpstreamProviderId } from '@bossraid/constants';
import { isTeeModelId } from './shared.js';
import {
  buildMockPhalaTeeReport,
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
  shouldUseTeeMock,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';
import {
  applyChatOptionsToBody,
  resolveChatMessagesForUpstream,
  type RaidChatOptions,
} from '../chat-options.js';

const PHALA_BASE = 'https://cloud-api.phala.network/api/v1';
const PROVIDER = 'phala' satisfies UpstreamProviderId;

const MOCK_PHALA_MODELS: UpstreamModelRecord[] = [
  {
    id: 'phala/gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored',
    teeAttested: true,
    e2ee: true,
  },
];

export async function fetchPhalaUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_PHALA_MODELS,
    env: options.env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<{ id: string; name?: string }> }>(
        `${PHALA_BASE}/models`,
        { apiKey }
      );
      return (payload.data ?? []).map((model) => ({
        id: model.id,
        displayName: model.name ?? model.id,
        teeAttested: isTeeModelId(model.id),
        e2ee: model.id.toLowerCase().includes('e2ee'),
      }));
    },
  });
}

export async function probePhalaChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${PHALA_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-phala-response:${input.modelId}`,
    body: applyChatOptionsToBody(
      {
        model: input.modelId,
        messages: resolveChatMessagesForUpstream({
          prompt: input.prompt,
          chatOptions: input.chatOptions,
        }),
        max_tokens: 16,
      },
      input.chatOptions
    ),
  });
}

export async function fetchPhalaAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Record<string, unknown>> {
  const env = input.env ?? process.env;
  if (shouldUseTeeMock(PROVIDER, env)) {
    return buildMockPhalaTeeReport({ modelId: input.modelId, nonce: input.nonce });
  }

  const url = new URL(`${PHALA_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
