import { fetchUpstreamJson, isTeeModelId } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const PHALA_BASE = 'https://cloud-api.phala.network/api/v1';

const MOCK_PHALA_MODELS: UpstreamModelRecord[] = [
  {
    id: 'phala/gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored',
    teeAttested: true,
    e2ee: true,
  },
];

export async function fetchPhalaUpstreamModels(apiKey: string): Promise<UpstreamModelRecord[]> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_PHALA_MOCK === '1') {
    return MOCK_PHALA_MODELS;
  }

  try {
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
  } catch {
    return MOCK_PHALA_MODELS;
  }
}

export async function probePhalaChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_PHALA_MOCK === '1') {
    return { content: `mock-phala-response:${input.modelId}` };
  }

  const payload = await fetchUpstreamJson<{
    id?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
  }>(`${PHALA_BASE}/chat/completions`, {
    apiKey: input.apiKey,
    method: 'POST',
    body: {
      model: input.modelId,
      messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
      max_tokens: 16,
    },
  });

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Phala chat response was empty.');
  }
  return { content, requestId: payload.id };
}

export async function fetchPhalaAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
}): Promise<Record<string, unknown>> {
  if (process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1') {
    return {
      verified: true,
      request_nonce: input.nonce,
      model: input.modelId,
      signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
      intel_quote: 'mock-intel-quote',
      nvidia_payload: JSON.stringify({ nonce: input.nonce }),
    };
  }

  const url = new URL(`${PHALA_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
