import { fetchUpstreamJson, isE2eeModelId, isTeeModelId } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const NEAR_BASE = 'https://cloud-api.near.ai/v1';

const MOCK_NEAR_MODELS: UpstreamModelRecord[] = [
  {
    id: 'zai-org/GLM-5.1-FP8',
    displayName: 'GLM 5.1 FP8',
    teeAttested: true,
    e2ee: true,
  },
];

export async function fetchNearUpstreamModels(apiKey: string): Promise<UpstreamModelRecord[]> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_NEAR_MOCK === '1') {
    return MOCK_NEAR_MODELS;
  }

  try {
    const payload = await fetchUpstreamJson<{ data?: Array<{ id: string }> }>(
      `${NEAR_BASE}/models`,
      { apiKey }
    );
    return (payload.data ?? []).map((model) => ({
      id: model.id,
      displayName: model.id,
      teeAttested: true,
      e2ee: isE2eeModelId(model.id),
    }));
  } catch {
    return MOCK_NEAR_MODELS;
  }
}

export async function probeNearChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_UPSTREAM_MOCK === '1' || process.env.BOSSRAID_NEAR_MOCK === '1') {
    return { content: `mock-near-response:${input.modelId}` };
  }

  const payload = await fetchUpstreamJson<{
    id?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
  }>(`${NEAR_BASE}/chat/completions`, {
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
    throw new Error('NEAR chat response was empty.');
  }
  return { content, requestId: payload.id };
}

export async function fetchNearAttestationReport(input: {
  apiKey: string;
  modelId: string;
  nonce: string;
  signingAlgo?: 'ecdsa' | 'ed25519';
}): Promise<Record<string, unknown>> {
  if (process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1') {
    return {
      model_attestations: [
        {
          signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
          intel_quote: 'mock-intel-quote',
          nvidia_payload: JSON.stringify({ nonce: input.nonce }),
        },
      ],
    };
  }

  const url = new URL(`${NEAR_BASE}/attestation/report`);
  url.searchParams.set('model', input.modelId);
  url.searchParams.set('signing_algo', input.signingAlgo ?? 'ecdsa');
  url.searchParams.set('nonce', input.nonce);
  return fetchUpstreamJson(url.toString(), { apiKey: input.apiKey });
}
