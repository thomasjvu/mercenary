import { readUpstreamUsage } from './usage.js';
import { isProviderInferenceMock } from '../upstream-mock.js';
import {
  INFERENCE_MODEL_CATALOG,
  UPSTREAM_PROVIDER_CONFIG,
  type UpstreamProviderId,
} from '@bossraid/constants';
import { resolveChatMessagesForUpstream, type RaidChatOptions } from '../chat-options.js';
import { fetchUpstreamModelsWithFallback } from './adapter-helpers.js';
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
  if (isProviderInferenceMock(PROVIDER, env))
    return { content: `mock-openai-response:${input.modelId}` };
  const entry = INFERENCE_MODEL_CATALOG.find(
    (m) => m.modelProvider === PROVIDER && m.upstreamModelId === input.modelId
  );
  const body: Record<string, unknown> = {
    model: input.modelId,
    input: resolveChatMessagesForUpstream(input),
    store: false,
    max_output_tokens: input.chatOptions?.max_tokens ?? 1024,
  };
  if (input.chatOptions?.temperature != null && entry?.capabilities?.temperature !== false)
    body.temperature = input.chatOptions.temperature;
  if (input.chatOptions?.reasoning_effort && entry?.capabilities?.reasoning)
    body.reasoning = { effort: input.chatOptions.reasoning_effort };
  const payload = await fetchUpstreamJson<{
    id?: string;
    usage?: unknown;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  }>(`${resolveOpenAIBase(env)}/responses`, { apiKey: input.apiKey, method: 'POST', body });
  const content = (payload.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!content) throw new Error('OpenAI response was empty.');
  return { content, requestId: payload.id, usage: readUpstreamUsage(payload.usage) };
}

export async function fetchOpenAIAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error('OpenAI does not publish Boss Raid-compatible upstream TEE attestation reports.');
}
