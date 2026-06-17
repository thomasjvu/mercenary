import type { UpstreamProviderId } from '@bossraid/constants';
import { isProviderInferenceMock, isProviderTeeMock } from '../upstream-mock.js';
import { fetchUpstreamJson } from './shared.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

const MOCK_SIGNING_ADDRESS = '0x3573d4c8b9c3ce0360594095af0c0629de45c02a';

export async function fetchUpstreamModelsWithFallback(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  mockModels: UpstreamModelRecord[];
  fetchModels: () => Promise<UpstreamModelRecord[]>;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamModelRecord[]> {
  const env = input.env ?? process.env;
  if (isProviderInferenceMock(input.provider, env)) {
    return input.mockModels;
  }

  try {
    return await input.fetchModels();
  } catch (error) {
    if (env.NODE_ENV === 'production') {
      throw error;
    }
    return input.mockModels;
  }
}

export async function probeOpenAiStyleChatCompletion(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  url: string;
  body: Record<string, unknown>;
  mockContent: string;
  mockExtras?: Partial<UpstreamChatResult>;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  if (isProviderInferenceMock(input.provider, env)) {
    return { content: input.mockContent, ...input.mockExtras };
  }

  const payload = await fetchUpstreamJson<{
    id?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
  }>(input.url, {
    apiKey: input.apiKey,
    method: 'POST',
    body: input.body,
  });

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${input.provider} chat response was empty.`);
  }

  return {
    content,
    requestId: payload.id,
    ...input.mockExtras,
  };
}

export function buildMockVeniceTeeReport(input: {
  modelId: string;
  nonce: string;
}): Record<string, unknown> {
  return {
    verified: true,
    nonce: input.nonce,
    model: input.modelId,
    tee_provider: 'venice',
    signing_address: MOCK_SIGNING_ADDRESS,
    intel_quote: 'mock-intel-quote',
  };
}

export function buildMockPhalaTeeReport(input: {
  modelId: string;
  nonce: string;
}): Record<string, unknown> {
  return {
    verified: true,
    request_nonce: input.nonce,
    model: input.modelId,
    signing_address: MOCK_SIGNING_ADDRESS,
    intel_quote: 'mock-intel-quote',
    nvidia_payload: JSON.stringify({ nonce: input.nonce }),
  };
}

export function buildMockRedpillTeeReport(input: { nonce: string }): Record<string, unknown> {
  return {
    signing_address: MOCK_SIGNING_ADDRESS,
    signing_algo: 'ecdsa',
    request_nonce: input.nonce,
    intel_quote: 'mock-intel-quote',
    nvidia_payload: JSON.stringify({ nonce: input.nonce }),
  };
}

export function buildMockNearTeeReport(input: { nonce: string }): Record<string, unknown> {
  return {
    model_attestations: [
      {
        signing_address: MOCK_SIGNING_ADDRESS,
        intel_quote: 'mock-intel-quote',
        nvidia_payload: JSON.stringify({ nonce: input.nonce }),
      },
    ],
  };
}

export function buildMockChutesTeeEvidence(input: { nonce: string }): Record<string, unknown> {
  return {
    quote: 'mock-tdx-quote',
    gpu_evidence: [{ nonce: input.nonce }],
    certificate: 'mock-cert',
  };
}

export function shouldUseTeeMock(
  provider: UpstreamProviderId,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isProviderTeeMock(provider, env);
}
