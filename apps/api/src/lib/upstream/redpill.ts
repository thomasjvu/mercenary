import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { fetchUpstreamJson, isE2eeModelId, isTeeModelId } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const REDPILL_BASE = 'https://api.redpill.ai/v1';

const MOCK_REDPILL_MODELS: UpstreamModelRecord[] = [
  {
    id: 'phala/gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored',
    teeAttested: true,
    e2ee: false,
  },
];

export async function fetchRedpillUpstreamModels(apiKey: string): Promise<UpstreamModelRecord[]> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_REDPILL_MOCK === '1') {
    return MOCK_REDPILL_MODELS;
  }

  try {
    const payload = await fetchUpstreamJson<{ data?: Array<{ id: string; name?: string }> }>(
      `${REDPILL_BASE}/models`,
      { apiKey }
    );
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      displayName: model.name ?? model.id,
      teeAttested: isTeeModelId(model.id),
      e2ee: isE2eeModelId(model.id),
    }));
  } catch {
    return MOCK_REDPILL_MODELS;
  }
}

export async function probeRedpillChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_REDPILL_MOCK === '1') {
    return { content: `mock-redpill-response:${input.modelId}` };
  }

  const payload = await fetchUpstreamJson<{
    id?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
  }>(`${REDPILL_BASE}/chat/completions`, {
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
    throw new Error('Redpill chat response was empty.');
  }
  return { content, requestId: payload.id };
}

export async function fetchRedpillAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  signingAddress?: string;
}): Promise<Record<string, unknown>> {
  if (process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1') {
    return {
      signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
      signing_algo: 'ecdsa',
      request_nonce: input.nonce,
      intel_quote: 'mock-intel-quote',
      nvidia_payload: JSON.stringify({ nonce: input.nonce }),
    };
  }

  const url = new URL(`${REDPILL_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('nonce', input.nonce);
  if (input.signingAddress) {
    url.searchParams.set('signing_address', input.signingAddress);
  }
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
