import type { UpstreamProviderId } from '@bossraid/constants';
import { applyChatOptionsToBody, type RaidChatOptions } from '../chat-options.js';
import {
  fetchUpstreamModelsWithFallback,
  probeOpenAiStyleChatCompletion,
} from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const DARKBLOOM_BASE = 'https://api.darkbloom.dev/v1';
const PROVIDER = 'darkbloom' satisfies UpstreamProviderId;

/** Static fallback when live /models is unavailable (local mock / non-prod failure). */
const MOCK_DARKBLOOM_MODELS: UpstreamModelRecord[] = [
  {
    id: 'gemma-4-26b',
    displayName: 'Gemma 4 26B',
    teeAttested: false,
    e2ee: false,
  },
  {
    id: 'gpt-oss-20b',
    displayName: 'GPT-OSS 20B',
    teeAttested: false,
    e2ee: false,
  },
];

export async function fetchDarkbloomUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_DARKBLOOM_MODELS,
    env: options.env,
    fetchModels: async () => {
      // Authenticated list when key present; public catalog is used at catalog sync time.
      try {
        const payload = await fetchUpstreamJson<{
          data?: Array<{ id: string; name?: string }>;
          models?: Array<{ id: string; name?: string; display_name?: string }>;
        }>(`${DARKBLOOM_BASE}/models`, { apiKey });
        const rows = payload.data ?? payload.models ?? [];
        if (rows.length > 0) {
          return rows.map((model) => {
            const display =
              typeof (model as { display_name?: string }).display_name === 'string'
                ? (model as { display_name?: string }).display_name
                : model.name;
            return {
              id: model.id,
              displayName: display?.trim() || model.id,
              teeAttested: false,
              e2ee: false,
            };
          });
        }
      } catch {
        // fall through to public catalog
      }

      const catalogResponse = await fetch(`${DARKBLOOM_BASE}/models/catalog`, {
        headers: { accept: 'application/json' },
      });
      if (!catalogResponse.ok) {
        throw new Error(`Darkbloom catalog request failed (${catalogResponse.status}).`);
      }
      const catalog = (await catalogResponse.json()) as {
        models?: Array<{ id: string; name?: string; display_name?: string; active?: boolean }>;
      };
      return (catalog.models ?? [])
        .filter((model) => model.active !== false)
        .map((model) => ({
          id: model.id,
          displayName: model.display_name ?? model.name ?? model.id,
          teeAttested: false,
          e2ee: false,
        }));
    },
  });
}

export async function probeDarkbloomChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const body = applyChatOptionsToBody(
    {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
    input.chatOptions
  );
  return probeOpenAiStyleChatCompletion({
    provider: PROVIDER,
    apiKey: input.apiKey,
    url: `${DARKBLOOM_BASE}/chat/completions`,
    env: input.env,
    mockContent: `mock-darkbloom-response:${input.modelId}`,
    body,
  });
}

/**
 * Darkbloom verifies providers via Apple Secure Enclave attestation on the network side.
 * Boss Raid does not yet ingest those quotes as upstream TEE reports comparable to Venice/Phala.
 */
export async function fetchDarkbloomAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'Darkbloom does not publish Boss Raid–compatible upstream TEE attestation reports yet. Treat offers as private api_chat without tee_attested claims.'
  );
}
