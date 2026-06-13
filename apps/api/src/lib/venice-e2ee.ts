import { TIMEOUTS } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import {
  decryptE2eeStream,
  encryptMessagesForE2ee,
  generateE2eeSession,
} from '@bossraid/privacy-engine';
import type { TeeAttestationResult } from '@bossraid/shared-types';
import { verifyUpstreamTee } from './attestation-service.js';
import { generateAttestationNonce } from './upstream/index.js';
import type { UpstreamChatResult } from './upstream/types.js';
import { isProviderInferenceMock, mockVeniceE2eeContent } from './upstream-mock.js';

export const VENICE_E2EE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';

export type VeniceE2eeSession = ReturnType<typeof generateE2eeSession>;

export function buildVeniceE2eeRequestHeaders(
  apiKey: string,
  session: VeniceE2eeSession
): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey.trim()}`,
    'content-type': 'application/json',
    'X-Venice-TEE-Client-Pub-Key': session.publicKeyHex,
    'X-Venice-TEE-Model-Pub-Key': session.modelPublicKey,
    'X-Venice-TEE-Signing-Algo': 'ecdsa',
  };
}

export async function requireVeniceE2eeAttestation(input: {
  provider: UpstreamProviderId;
  modelId: string;
  providerId: string;
  apiKey: string;
  nonce?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ attestation: TeeAttestationResult; nonce: string; session: VeniceE2eeSession }> {
  const nonce = input.nonce ?? generateAttestationNonce();
  const { attestation } = await verifyUpstreamTee({
    provider: input.provider,
    modelId: input.modelId,
    providerId: input.providerId,
    apiKey: input.apiKey,
    nonce,
    env: input.env,
  });

  if (!attestation.valid || !attestation.e2eeReady) {
    throw new Error('TEE attestation must pass with E2EE signing key before inference.');
  }

  const signingKey = attestation.signingKey;
  if (!signingKey) {
    throw new Error('Attestation response did not include an E2EE signing key.');
  }

  return {
    attestation,
    nonce,
    session: generateE2eeSession(signingKey, attestation.signingAddress),
  };
}

export async function fetchVeniceE2eeChatCompletion(input: {
  apiKey: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  session: VeniceE2eeSession;
  stream?: boolean;
  maxCompletionTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<Response> {
  const encryptedMessages = encryptMessagesForE2ee(input.messages, input.session.modelPublicKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUTS.VENICE_TIMEOUT);

  try {
    const response = await fetch(VENICE_E2EE_CHAT_URL, {
      method: 'POST',
      headers: buildVeniceE2eeRequestHeaders(input.apiKey, input.session),
      body: JSON.stringify({
        model: input.modelId,
        messages: encryptedMessages,
        stream: input.stream ?? false,
        ...(input.maxCompletionTokens == null
          ? {}
          : { max_completion_tokens: input.maxCompletionTokens }),
        ...(input.temperature == null ? {} : { temperature: input.temperature }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Venice E2EE chat request failed (${response.status}).`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeVeniceE2eeChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  providerId?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<UpstreamChatResult> {
  const env = input.env ?? process.env;
  if (isProviderInferenceMock('venice', env)) {
    return { content: mockVeniceE2eeContent(input.modelId) };
  }

  const { session } = await requireVeniceE2eeAttestation({
    provider: 'venice',
    modelId: input.modelId,
    providerId: input.providerId ?? `catalog:venice:${input.modelId}`,
    apiKey: input.apiKey,
    env,
  });

  const response = await fetchVeniceE2eeChatCompletion({
    apiKey: input.apiKey,
    modelId: input.modelId,
    messages: [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }],
    session,
    stream: true,
    maxCompletionTokens: 32,
    timeoutMs: input.timeoutMs,
  });

  const content = await decryptE2eeStream(response, session);
  if (!content.trim()) {
    throw new Error('Venice E2EE chat response was empty.');
  }

  return { content: content.trim() };
}
