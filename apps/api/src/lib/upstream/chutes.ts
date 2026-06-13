import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const CHUTES_BASE = 'https://api.chutes.ai';

const MOCK_CHUTES_MODELS: UpstreamModelRecord[] = [
  {
    id: 'tee-qwen3-5-122b',
    displayName: 'TEE Qwen3.5 122B',
    teeAttested: true,
    e2ee: false,
  },
];

export async function fetchChutesUpstreamModels(apiKey: string): Promise<UpstreamModelRecord[]> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_CHUTES_MOCK === '1') {
    return MOCK_CHUTES_MODELS;
  }

  try {
    const payload = await fetchUpstreamJson<{
      data?: Array<{ id: string; name?: string; tee?: boolean }>;
    }>(`${CHUTES_BASE}/chutes`, { apiKey });
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      displayName: model.name ?? model.id,
      teeAttested: model.tee === true || model.id.toLowerCase().includes('tee'),
      e2ee: false,
    }));
  } catch {
    return MOCK_CHUTES_MODELS;
  }
}

export async function probeChutesChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_CHUTES_MOCK === '1') {
    return { content: `mock-chutes-response:${input.modelId}`, instanceId: 'mock-instance' };
  }

  const payload = await fetchUpstreamJson<{
    id?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
  }>(`${CHUTES_BASE}/chutes/${encodeURIComponent(input.modelId)}/chat/completions`, {
    apiKey: input.apiKey,
    method: 'POST',
    body: {
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
      stream: false,
    },
  });

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Chutes chat response was empty.');
  }
  return { content, requestId: payload.id, instanceId: payload.id };
}

export async function fetchChutesAttestationEvidence(input: {
  apiKey: string;
  instanceId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  if (process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1') {
    return {
      quote: 'mock-tdx-quote',
      gpu_evidence: [{ nonce: input.nonce }],
      certificate: 'mock-cert',
    };
  }

  const url = new URL(`${CHUTES_BASE}/instances/${encodeURIComponent(input.instanceId)}/evidence`);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
