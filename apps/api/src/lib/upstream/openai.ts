import {
  INFERENCE_MODEL_CATALOG,
  UPSTREAM_PROVIDER_CONFIG,
  type UpstreamProviderId,
} from '@bossraid/constants';
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

const PROVIDER = 'openai' satisfies UpstreamProviderId;
const OPENAI_BASE = UPSTREAM_PROVIDER_CONFIG.openai.upstreamBase;

const MOCK_OPENAI_MODELS: UpstreamModelRecord[] = INFERENCE_MODEL_CATALOG.filter(
  (model) => model.modelProvider === PROVIDER
).map((model) => ({
  id: model.upstreamModelId,
  displayName: model.displayName,
  teeAttested: model.teeAttested,
  e2ee: model.e2ee,
  maxContextTokens: model.maxContextTokens,
}));

function resolveOpenAIBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.BOSSRAID_OPENAI_API_BASE?.trim().replace(/\/+$/u, '') || OPENAI_BASE;
}

export async function fetchOpenAIUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const env = options.env ?? process.env;
  const base = resolveOpenAIBase(env);

  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_OPENAI_MODELS,
    env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{
        data?: Array<{ id: string; created?: number; owned_by?: string }>;
      }>(`${base}/models`, { apiKey });
      return (payload.data ?? [])
        .filter((model) => typeof model.id === 'string' && model.id.length > 0)
        .map((model) => ({
          id: model.id,
          displayName: model.id,
          teeAttested: false,
          e2ee: false,
        }));
    },
  });
}

export async function probeOpenAIChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const body = applyChatOptionsToBody(
    {
      model: input.modelId,
      messages: resolveChatMessagesForUpstream({
        prompt: input.prompt,
        chatOptions: input.chatOptions,
      }),
      max_tokens: 16,
    },
    input.chatOptions
  );
  // Current OpenAI chat models use max_completion_tokens; keep the shared option
  // builder's max_tokens shape internal to the adapter.
  body.max_completion_tokens = body.max_tokens;
  delete body.max_tokens;

  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${resolveOpenAIBase(env)}/chat/completions`,
    env,
    mockContent: `mock-openai-response:${input.modelId}`,
    body,
  });
}

export async function fetchOpenAIAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error('OpenAI does not publish Boss Raid-compatible upstream TEE attestation reports.');
}
