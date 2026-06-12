import { TIMEOUTS } from '@bossraid/constants';
import {
  decryptChunk,
  decryptE2eeStream,
  encryptMessagesForE2ee,
  generateE2eeSession,
  isHexEncrypted,
} from '@bossraid/privacy-engine';
import { verifySellerUpstreamTeeAttestation } from './upstream-tee-service.js';
import { generateAttestationNonce } from './upstream/shared.js';
import type { UpstreamChatResult } from './upstream/types.js';

const VENICE_BASE = 'https://api.venice.ai/api/v1';

export async function probeVeniceE2eeChatCompletion(input: {
  apiKey: string;
  modelId: string;
  prompt?: string;
  providerId?: string;
  timeoutMs?: number;
}): Promise<UpstreamChatResult> {
  if (process.env.BOSSRAID_VENICE_MOCK === '1') {
    return { content: `mock-venice-e2ee:${input.modelId}` };
  }

  const attestation = await verifySellerUpstreamTeeAttestation({
    provider: 'venice',
    modelId: input.modelId,
    providerId: input.providerId ?? `catalog:venice:${input.modelId}`,
    apiKey: input.apiKey,
    nonce: generateAttestationNonce(),
  });

  if (!attestation.valid || !attestation.e2eeReady || !attestation.signingKey) {
    throw new Error('Venice E2EE attestation failed or signing key missing.');
  }

  const session = generateE2eeSession(attestation.signingKey, attestation.signingAddress);
  const prompt = input.prompt ?? 'Reply with the single word: ok';
  const encryptedMessages = encryptMessagesForE2ee(
    [{ role: 'user', content: prompt }],
    session.modelPublicKey
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? TIMEOUTS.VENICE_TIMEOUT);

  try {
    const response = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey.trim()}`,
        'content-type': 'application/json',
        'X-Venice-TEE-Client-Pub-Key': session.publicKeyHex,
        'X-Venice-TEE-Model-Pub-Key': session.modelPublicKey,
        'X-Venice-TEE-Signing-Algo': 'ecdsa',
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: encryptedMessages,
        stream: true,
        max_completion_tokens: 32,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Venice E2EE chat request failed (${response.status}).`);
    }

    const content = await decryptE2eeStream(response, session);
    if (!content.trim()) {
      throw new Error('Venice E2EE chat response was empty.');
    }

    return { content: content.trim() };
  } finally {
    clearTimeout(timeout);
  }
}

export async function decryptVeniceE2eeMessage(
  ciphertextHex: string,
  signingKey: string,
  signingAddress?: string
): Promise<string> {
  if (!isHexEncrypted(ciphertextHex)) {
    return ciphertextHex;
  }
  const session = generateE2eeSession(signingKey, signingAddress);
  return decryptChunk(ciphertextHex, session.privateKey);
}
