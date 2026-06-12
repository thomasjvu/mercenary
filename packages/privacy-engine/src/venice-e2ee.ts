import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import elliptic from 'elliptic';

const EC = elliptic.ec;

const HKDF_INFO = new TextEncoder().encode('ecdsa_encryption');

export type E2eeSession = {
  privateKey: Uint8Array;
  publicKeyHex: string;
  modelPublicKey: string;
  signingAddress?: string;
};

export function generateE2eeSession(modelPublicKey: string, signingAddress?: string): E2eeSession {
  const ec = new EC('secp256k1');
  const keyPair = ec.genKeyPair();
  return {
    privateKey: new Uint8Array(keyPair.getPrivate().toArray('be', 32)),
    publicKeyHex: keyPair.getPublic('hex'),
    modelPublicKey,
    signingAddress,
  };
}

function normalizePublicKeyHex(modelPublicKeyHex: string): string {
  if (!modelPublicKeyHex.startsWith('04') && modelPublicKeyHex.length === 128) {
    return `04${modelPublicKeyHex}`;
  }
  return modelPublicKeyHex;
}

export function encryptMessage(plaintext: string, modelPublicKeyHex: string): string {
  const ec = new EC('secp256k1');
  const modelPublicKey = ec.keyFromPublic(normalizePublicKeyHex(modelPublicKeyHex), 'hex');
  const ephemeralKeyPair = ec.genKeyPair();
  const sharedSecret = ephemeralKeyPair.derive(modelPublicKey.getPublic());
  const sharedSecretBytes = new Uint8Array(sharedSecret.toArray('be', 32));
  const aesKey = hkdf(sha256, sharedSecretBytes, undefined, HKDF_INFO, 32);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = gcm(aesKey, nonce);
  const encrypted = cipher.encrypt(new TextEncoder().encode(plaintext));
  const ephemeralPublic = new Uint8Array(ephemeralKeyPair.getPublic(false, 'array'));
  const result = new Uint8Array(65 + 12 + encrypted.length);
  result.set(ephemeralPublic, 0);
  result.set(nonce, 65);
  result.set(encrypted, 65 + 12);
  return Buffer.from(result).toString('hex');
}

export function decryptChunk(ciphertextHex: string, clientPrivateKey: Uint8Array): string {
  const raw = Buffer.from(ciphertextHex, 'hex');
  const serverEphemeralPubKey = raw.subarray(0, 65);
  const nonce = raw.subarray(65, 77);
  const ciphertext = raw.subarray(77);
  const ec = new EC('secp256k1');
  const clientKey = ec.keyFromPrivate(Buffer.from(clientPrivateKey));
  const serverKey = ec.keyFromPublic(Buffer.from(serverEphemeralPubKey));
  const sharedSecret = clientKey.derive(serverKey.getPublic());
  const sharedSecretBytes = new Uint8Array(sharedSecret.toArray('be', 32));
  const aesKey = hkdf(sha256, sharedSecretBytes, undefined, HKDF_INFO, 32);
  const cipher = gcm(aesKey, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function encryptMessagesForE2ee(
  messages: Array<{ role: string; content: string }>,
  modelPublicKey: string
): Array<{ role: string; content: string }> {
  return messages.map((message) => {
    if (message.role === 'user' || message.role === 'system') {
      return {
        ...message,
        content: encryptMessage(message.content, modelPublicKey),
      };
    }
    return message;
  });
}

export function isHexEncrypted(value: string): boolean {
  return value.length >= 186 && /^[0-9a-fA-F]+$/.test(value);
}

export async function decryptE2eeStream(
  response: Response,
  session: E2eeSession,
  onChunk?: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('E2EE response body missing.');
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (!content || !isHexEncrypted(content)) {
          continue;
        }
        const decrypted = decryptChunk(content, session.privateKey);
        fullText += decrypted;
        onChunk?.(decrypted);
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullText;
}
