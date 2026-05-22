import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_SECRET_PREFIX = 'brenc:v1';

export interface SecretCipher {
  enabled: boolean;
  keyId: string | null;
  encrypt(value: string): string;
  decrypt(value: string): string;
  isEncrypted(value: string | undefined): boolean;
}

export function createSecretCipher(env: NodeJS.ProcessEnv = process.env): SecretCipher {
  const rawKey = env.BOSSRAID_SECRET_ENCRYPTION_KEY ?? env.BOSSRAID_ENCRYPTION_KEY;
  const keyId = env.BOSSRAID_SECRET_ENCRYPTION_KEY_ID ?? 'default';

  if (!rawKey?.trim()) {
    return {
      enabled: false,
      keyId: null,
      encrypt: (value) => value,
      decrypt(value) {
        if (isEncryptedSecretValue(value)) {
          throw new Error(
            'BOSSRAID_SECRET_ENCRYPTION_KEY is required to decrypt persisted Boss Raid secrets.'
          );
        }
        return value;
      },
      isEncrypted: isEncryptedSecretValue,
    };
  }

  const key = normalizeSecretKey(rawKey);
  const decryptionKeys = [key, ...parsePreviousKeys(env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS)];

  return {
    enabled: true,
    keyId,
    encrypt(value) {
      if (isEncryptedSecretValue(value)) {
        return value;
      }
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(keyId, 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [
        ENCRYPTED_SECRET_PREFIX,
        encodeComponent(keyId),
        encodeComponent(iv),
        encodeComponent(tag),
        encodeComponent(ciphertext),
      ].join(':');
    },
    decrypt(value) {
      if (!isEncryptedSecretValue(value)) {
        return value;
      }
      const parts = value.split(':');
      if (parts.length !== 6) {
        throw new Error('Invalid encrypted Boss Raid secret envelope.');
      }
      const envelopeKeyId = decodeComponent(parts[2]!).toString('utf8');
      const iv = decodeComponent(parts[3]!);
      const tag = decodeComponent(parts[4]!);
      const ciphertext = decodeComponent(parts[5]!);
      for (const decryptionKey of decryptionKeys) {
        try {
          const decipher = createDecipheriv('aes-256-gcm', decryptionKey, iv);
          decipher.setAAD(Buffer.from(envelopeKeyId, 'utf8'));
          decipher.setAuthTag(tag);
          return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        } catch {
          // Try the next configured key so secret rotation can decrypt old state.
        }
      }

      throw new Error('Unable to decrypt Boss Raid secret with configured keys.');
    },
    isEncrypted: isEncryptedSecretValue,
  };
}

export function isEncryptedSecretValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

function normalizeSecretKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  if (/^[a-f0-9]{64}$/iu.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  try {
    const base64 = Buffer.from(trimmed, 'base64');
    if (base64.length === 32) {
      return base64;
    }
  } catch {
    // Fall through to hashing arbitrary key material.
  }

  return createHash('sha256').update(trimmed).digest();
}

function parsePreviousKeys(rawKeys: string | undefined): Buffer[] {
  if (!rawKeys?.trim()) {
    return [];
  }

  return rawKeys
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .map(normalizeSecretKey);
}

function encodeComponent(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function decodeComponent(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
