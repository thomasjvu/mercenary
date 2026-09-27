import { readUpstreamUsage } from './usage.js';
import { isProviderInferenceMock } from '../upstream-mock.js';
import {
  INFERENCE_MODEL_CATALOG,
  UPSTREAM_PROVIDER_CONFIG,
  type UpstreamProviderId,
} from '@bossraid/constants';
import { fetchUpstreamModelsWithFallback } from './adapter-helpers.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';
import { resolveChatMessagesForUpstream, type RaidChatOptions } from '../chat-options.js';

const PROVIDER = 'anthropic' satisfies UpstreamProviderId;
const ANTHROPIC_BASE = UPSTREAM_PROVIDER_CONFIG.anthropic.upstreamBase;

const MOCK_ANTHROPIC_MODELS: UpstreamModelRecord[] = INFERENCE_MODEL_CATALOG.filter(
  (model) => model.modelProvider === PROVIDER
).map((model) => ({
  id: model.upstreamModelId,
  displayName: model.displayName,
  teeAttested: model.teeAttested,
  e2ee: model.e2ee,
  maxContextTokens: model.maxContextTokens,
}));

// Catalog modelIds are anthropic/*; live /models returns bare Anthropic ids (matched via catalog-merge).

export async function fetchAnthropicUpstreamModels(
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  const base =
    options.env?.BOSSRAID_ANTHROPIC_API_BASE?.trim().replace(/\/+$/u, '') || ANTHROPIC_BASE;
  return fetchUpstreamModelsWithFallback({
    provider: PROVIDER,
    apiKey,
    mockModels: MOCK_ANTHROPIC_MODELS,
    env: options.env,
    fetchModels: async () => {
      const models: UpstreamModelRecord[] = [];
      let after: string | undefined;
      const visited = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const url = new URL(`${base}/models`);
        url.searchParams.set('limit', '100');
        if (after) url.searchParams.set('after_id', after);
        const payload = await fetchUpstreamJson<{
          data?: Array<{ id: string; display_name?: string }>;
          has_more?: boolean;
          last_id?: string;
        }>(url.toString(), {
          apiKey,
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
        if (!Array.isArray(payload.data)) throw new Error('Invalid Anthropic model list.');
        models.push(
          ...payload.data.map((m) => ({ id: m.id, displayName: m.display_name ?? m.id }))
        );
        if (!payload.has_more) return models;
        if (!payload.last_id || visited.has(payload.last_id))
          throw new Error('Invalid Anthropic model pagination.');
        after = payload.last_id;
        visited.add(after);
      }
      throw new Error('Anthropic model pagination limit exceeded.');
    },
  });
}

export async function probeAnthropicChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  chatOptions?: RaidChatOptions;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  const base = env.BOSSRAID_ANTHROPIC_API_BASE?.trim().replace(/\/+$/u, '') || ANTHROPIC_BASE;
  if (isProviderInferenceMock(PROVIDER, env))
    return { content: `mock-anthropic-response:${input.modelId}` };
  const messages = resolveChatMessagesForUpstream(input);
  const system = messages
    .filter((m) => m.role === 'system' || m.role === 'developer')
    .map((m) => m.content)
    .join('\n');
  const body: Record<string, unknown> = {
    model: input.modelId,
    messages: messages.filter((m) => m.role !== 'system' && m.role !== 'developer'),
    max_tokens: input.chatOptions?.max_tokens ?? 1024,
    ...(system ? { system } : {}),
  };
  const entry = INFERENCE_MODEL_CATALOG.find(
    (m) =>
      m.modelProvider === PROVIDER &&
      (m.upstreamModelId === input.modelId || m.upstreamAliases?.includes(input.modelId))
  );
  if (input.chatOptions?.temperature != null && entry?.capabilities?.temperature !== false)
    body.temperature = input.chatOptions.temperature;
  const payload = await fetchUpstreamJson<{
    id?: string;
    usage?: unknown;
    content?: Array<{ type: string; text?: string }>;
  }>(`${base}/messages`, {
    apiKey: input.apiKey,
    method: 'POST',
    headers: { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' },
    body,
  });
  const content = (payload.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!content) throw new Error('Anthropic response was empty.');
  return { content, requestId: payload.id, usage: readUpstreamUsage(payload.usage, true) };
}

/**
 * Anthropic does not publish a Boss Raid–compatible public TEE attestation report API.
 * Treat Claude offers as api_chat / agent_harness without tee_attested claims.
 */
export async function fetchAnthropicAttestationReport(_input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  throw new Error(
    'Anthropic (Claude) does not publish upstream TEE attestation reports. Use privacy features without tee_attested.'
  );
}
