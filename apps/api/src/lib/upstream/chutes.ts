import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import {
  applyChatOptionsToBody,
  resolveChatMessagesForUpstream,
  type RaidChatOptions,
} from '../chat-options.js';
import {
  buildMockChutesTeeEvidence,
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
  shouldUseTeeMock,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const PROVIDER = 'chutes' satisfies UpstreamProviderId;
/** OpenAI-compatible inference (agents, tools). */
const CHUTES_LLM_BASE = UPSTREAM_PROVIDER_CONFIG.chutes.upstreamBase;
/** Management + instance TEE evidence. */
const CHUTES_API_BASE = 'https://api.chutes.ai';

const MOCK_CHUTES_MODELS: UpstreamModelRecord[] = [
  {
    id: 'tee-qwen3-5-122b',
    displayName: 'TEE Qwen3.5 122B',
    teeAttested: true,
    e2ee: false,
  },
  {
    id: 'deepseek-ai/DeepSeek-V3.2-TEE',
    displayName: 'DeepSeek V3.2 TEE',
    teeAttested: true,
    e2ee: false,
  },
  {
    id: 'zai-org/GLM-5.2-TEE',
    displayName: 'GLM 5.2 TEE (Chutes)',
    teeAttested: true,
    e2ee: false,
  },
  {
    id: 'MiniMaxAI/MiniMax-M2.5-TEE',
    displayName: 'MiniMax M2.5 TEE',
    teeAttested: true,
    e2ee: false,
  },
];

function resolveChutesLlmBase(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.BOSSRAID_CHUTES_LLM_BASE?.trim().replace(/\/+$/u, '') ||
    env.BOSSRAID_CHUTES_API_BASE?.trim().replace(/\/+$/u, '') ||
    CHUTES_LLM_BASE
  );
}

export async function fetchChutesUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const env = options.env ?? process.env;
  const llmBase = resolveChutesLlmBase(env);

  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_CHUTES_MODELS,
    env,
    fetchModels: async () => {
      // Prefer OpenAI-compatible catalog on llm.chutes.ai
      try {
        const payload = await fetchUpstreamJson<{
          data?: Array<{ id: string; name?: string; owned_by?: string }>;
        }>(`${llmBase}/models`, { apiKey });
        if (payload.data?.length) {
          return payload.data.map((model) => ({
            id: model.id,
            displayName: model.name ?? model.id,
            teeAttested:
              model.id.toLowerCase().includes('tee') ||
              model.id.toLowerCase().includes('confidential'),
            e2ee: false,
          }));
        }
      } catch {
        // fall through to management API
      }

      const payload = await fetchUpstreamJson<{
        data?: Array<{ id: string; name?: string; tee?: boolean }>;
      }>(`${CHUTES_API_BASE}/chutes`, { apiKey });
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
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const llmBase = resolveChutesLlmBase(env);
  const messages = resolveChatMessagesForUpstream({
    prompt: input.prompt,
    chatOptions: input.chatOptions,
  });
  const baseBody = applyChatOptionsToBody(
    {
      messages,
      max_tokens: 16,
      stream: false,
    },
    input.chatOptions
  );

  // Prefer unified OpenAI path (tool-calling / agents)
  try {
    const result = await probeOpenAiStyleChatCompletion({
      provider: PROVIDER,
      apiKey: input.apiKey,
      url: `${llmBase}/chat/completions`,
      env,
      mockContent: `mock-chutes-response:${input.modelId}`,
      mockExtras: { instanceId: 'mock-instance' },
      body: {
        ...baseBody,
        model: input.modelId,
      },
    });
    return { ...result, instanceId: result.instanceId ?? result.requestId };
  } catch (error) {
    if (env.NODE_ENV === 'production' || isProviderInferenceMockLocal(env)) {
      throw error;
    }
  }

  // Legacy per-chute path on api.chutes.ai
  const result = await probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${CHUTES_API_BASE}/chutes/${encodeURIComponent(input.modelId)}/chat/completions`,
    env,
    mockContent: `mock-chutes-response:${input.modelId}`,
    mockExtras: { instanceId: 'mock-instance' },
    body: baseBody,
  });
  return { ...result, instanceId: result.instanceId ?? result.requestId };
}

function isProviderInferenceMockLocal(env: NodeJS.ProcessEnv): boolean {
  return env.BOSSRAID_UPSTREAM_MOCK === '1' || env.BOSSRAID_CHUTES_MOCK === '1';
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

  const url = new URL(
    `${CHUTES_API_BASE}/instances/${encodeURIComponent(input.instanceId)}/evidence`
  );
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
