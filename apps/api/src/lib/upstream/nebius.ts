import {
  listInferenceCatalogEntriesForProvider,
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

const PROVIDER = 'nebius' satisfies UpstreamProviderId;
const NEBIUS_BASE = UPSTREAM_PROVIDER_CONFIG.nebius.upstreamBase;

/** Use the complete priced catalog as the offline mock model list. */
const MOCK_NEBIUS_MODELS: UpstreamModelRecord[] = listInferenceCatalogEntriesForProvider(
  PROVIDER
).map((model) => ({
  id: model.upstreamModelId,
  displayName: model.displayName,
  teeAttested: model.teeAttested,
  e2ee: model.e2ee,
  maxContextTokens: model.maxContextTokens,
}));

function resolveNebiusBase(env: NodeJS.ProcessEnv = process.env): string {
  return env.BOSSRAID_NEBIUS_API_BASE?.trim().replace(/\/+$/u, '') || NEBIUS_BASE;
}

export async function fetchNebiusUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const env = options.env ?? process.env;
  const base = resolveNebiusBase(env);

  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_NEBIUS_MODELS,
    env,
    fetchModels: async () => {
      const payload = await fetchUpstreamJson<{ data?: Array<Record<string, unknown>> }>(
        `${base}/models`,
        { apiKey }
      );

      return (payload.data ?? [])
        .filter((model) => typeof model.id === 'string' && model.id.length > 0)
        .map((model) => ({
          id: model.id as string,
          displayName:
            (typeof model.display_name === 'string' && model.display_name) ||
            (typeof model.name === 'string' && model.name) ||
            (model.id as string),
          teeAttested: false,
          e2ee: false,
          maxContextTokens:
            typeof model.context_length === 'number' ? model.context_length : undefined,
        }));
    },
  });
}

export async function probeNebiusChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const base = resolveNebiusBase(env);

  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${base}/chat/completions`,
    env,
    mockContent: `mock-nebius-response:${input.modelId}`,
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

export async function fetchNebiusAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'Nebius Token Factory does not publish Boss Raid-compatible upstream TEE attestation reports. Treat offers as standard API inference without tee_attested claims.'
  );
}
