import type { UpstreamProviderId } from '@bossraid/constants';
import {
  decryptChunk,
  decryptE2eeStream,
  encryptMessagesForE2ee,
  generateE2eeSession,
  type E2eeSession,
} from '@bossraid/privacy-engine';
import type { TeeAttestationResult } from '@bossraid/shared-types';
import { verifyUpstreamTee } from './attestation-service.js';

const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';

export type UpstreamE2eeAdapter = {
  vendor: UpstreamProviderId;
  attest(input: {
    modelId: string;
    providerId: string;
    apiKey: string;
    env?: NodeJS.ProcessEnv;
  }): ReturnType<typeof verifyUpstreamTee>;
  encrypt(
    messages: Array<{ role: string; content: string }>,
    session: E2eeSession
  ): Array<{ role: string; content: string }>;
  decryptChunk(encrypted: string, session: E2eeSession): string;
  decryptStream(response: Response, session: E2eeSession): Promise<string>;
  chatUrl: string;
  buildHeaders(session: E2eeSession): Record<string, string>;
  createSession(signingKey: string, signingAddress?: string): E2eeSession;
};

export const veniceE2eeAdapter: UpstreamE2eeAdapter = {
  vendor: 'venice',
  attest: verifyUpstreamTee,
  encrypt(messages, session) {
    return encryptMessagesForE2ee(messages, session.modelPublicKey);
  },
  decryptChunk(encrypted, session) {
    return decryptChunk(encrypted, session.privateKey);
  },
  decryptStream: decryptE2eeStream,
  chatUrl: VENICE_CHAT_URL,
  buildHeaders(session) {
    return {
      'X-Venice-TEE-Client-Pub-Key': session.publicKeyHex,
      'X-Venice-TEE-Model-Pub-Key': session.modelPublicKey,
      'X-Venice-TEE-Signing-Algo': 'ecdsa',
    };
  },
  createSession(signingKey, signingAddress) {
    return generateE2eeSession(signingKey, signingAddress);
  },
};

export function resolveE2eeAdapter(vendor: UpstreamProviderId): UpstreamE2eeAdapter | undefined {
  if (vendor === 'venice') {
    return veniceE2eeAdapter;
  }
  return undefined;
}

export function requireE2eeSigningKey(attestation: TeeAttestationResult): string {
  const signingKey = attestation.signingKey;
  if (!signingKey) {
    throw new Error('Attestation response did not include an E2EE signing key.');
  }
  return signingKey;
}
