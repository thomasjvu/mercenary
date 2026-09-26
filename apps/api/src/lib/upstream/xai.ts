import { INFERENCE_MODEL_CATALOG, type UpstreamProviderId } from '@bossraid/constants';
import {
  applyChatOptionsToBody,
  resolveChatMessagesForUpstream,
  type RaidChatOptions,
} from '../chat-options.js';
import {
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const XAI_BASE = 'https://api.x.ai/v1';
const PROVIDER = 'xai' satisfies UpstreamProviderId;

/** Static fallback when live /models is unavailable (local mock / non-prod failure). */
const MOCK_XAI_MODELS: UpstreamModelRecord[] = INFERENCE_MODEL_CATALOG.filter(
  (model) => model.modelProvider === PROVIDER
).map((model) => ({
  id: model.upstreamModelId,
  displayName: model.displayName,
  teeAttested: model.teeAttested,
  e2ee: model.e2ee,
  maxContextTokens: model.maxContextTokens,
}));

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
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const body = applyChatOptionsToBody(
    {
      model: input.modelId,
      messages: resolveChatMessagesForUpstream({
        prompt: input.prompt,
        chatOptions: input.chatOptions,
      }),
      // Probe default; real chat passes max_tokens via chatOptions.
      max_tokens: 16,
    },
    input.chatOptions
  );
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${XAI_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-xai-response:${input.modelId}`,
    body,
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
