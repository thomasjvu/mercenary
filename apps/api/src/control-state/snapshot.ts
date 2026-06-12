import type { SecretCipher } from '@bossraid/persistence';
import {
  isValidBuyerApiKeyEntry,
  isValidBuyerPurchaseEntry,
  isValidOpsSessionEntry,
  isValidPublicAccountEntry,
  isValidPublicAuthNonceEntry,
  isValidPublicSessionEntry,
  isValidRateLimitEntry,
  isValidSellerPayoutEntry,
  isValidSellerUpstreamConfigEntry,
} from '../control-state-validators.js';
import type { ApiControlStateSnapshot, SellerUpstreamConfigEntry } from './types.js';

export function createEmptyApiControlState(): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    opsSessions: [],
    publicAuthNonces: [],
    publicSessions: [],
    publicAccounts: [],
    buyerApiKeys: [],
    buyerPurchases: [],
    sellerPayouts: [],
    sellerUpstreamConfigs: [],
    rateLimits: [],
    settings: {
      x402Enabled: false,
      seeded: false,
    },
  };
}

function migrateLegacyVeniceConfigs(
  snapshot: Partial<ApiControlStateSnapshot> | undefined
): SellerUpstreamConfigEntry[] {
  const upstream = Array.isArray(snapshot?.sellerUpstreamConfigs)
    ? snapshot.sellerUpstreamConfigs.filter(isValidSellerUpstreamConfigEntry)
    : [];

  const legacy = Array.isArray(snapshot?.sellerVeniceConfigs)
    ? snapshot.sellerVeniceConfigs.filter(isValidSellerUpstreamConfigEntry)
    : [];

  const merged = [...upstream];
  for (const entry of legacy) {
    const provider = entry.provider ?? 'venice';
    if (!merged.some((item) => item.wallet === entry.wallet && item.provider === provider)) {
      merged.push({ ...entry, provider });
    }
  }
  return merged;
}

export function normalizeApiControlState(
  snapshot: Partial<ApiControlStateSnapshot> | undefined
): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt:
      typeof snapshot?.savedAt === 'string' && snapshot.savedAt.length > 0
        ? snapshot.savedAt
        : new Date().toISOString(),
    opsSessions: Array.isArray(snapshot?.opsSessions)
      ? snapshot.opsSessions.filter(isValidOpsSessionEntry)
      : [],
    publicAuthNonces: Array.isArray(snapshot?.publicAuthNonces)
      ? snapshot.publicAuthNonces.filter(isValidPublicAuthNonceEntry)
      : [],
    publicSessions: Array.isArray(snapshot?.publicSessions)
      ? snapshot.publicSessions.filter(isValidPublicSessionEntry)
      : [],
    publicAccounts: Array.isArray(snapshot?.publicAccounts)
      ? snapshot.publicAccounts.filter(isValidPublicAccountEntry)
      : [],
    buyerApiKeys: Array.isArray(snapshot?.buyerApiKeys)
      ? snapshot.buyerApiKeys.filter(isValidBuyerApiKeyEntry)
      : [],
    buyerPurchases: Array.isArray(snapshot?.buyerPurchases)
      ? snapshot.buyerPurchases.filter(isValidBuyerPurchaseEntry)
      : [],
    sellerPayouts: Array.isArray(snapshot?.sellerPayouts)
      ? snapshot.sellerPayouts.filter(isValidSellerPayoutEntry)
      : [],
    sellerUpstreamConfigs: migrateLegacyVeniceConfigs(snapshot),
    rateLimits: Array.isArray(snapshot?.rateLimits)
      ? snapshot.rateLimits.filter(isValidRateLimitEntry)
      : [],
    settings: {
      x402Enabled: snapshot?.settings?.x402Enabled === true,
      seeded: snapshot?.settings?.seeded === true,
    },
  };
}

export function encryptApiControlStateSnapshot(
  snapshot: ApiControlStateSnapshot,
  cipher: SecretCipher
): ApiControlStateSnapshot {
  if (!cipher.enabled) {
    return snapshot;
  }

  return {
    ...snapshot,
    opsSessions: snapshot.opsSessions.map((session) => ({
      ...session,
      token: cipher.encrypt(session.token),
    })),
    publicAuthNonces: snapshot.publicAuthNonces.map((nonce) => ({
      ...nonce,
      nonce: cipher.encrypt(nonce.nonce),
    })),
    publicSessions: snapshot.publicSessions.map((session) => ({
      ...session,
      token: cipher.encrypt(session.token),
    })),
    buyerApiKeys: snapshot.buyerApiKeys.map((key) => ({
      ...key,
      keyHash: cipher.encrypt(key.keyHash),
    })),
    sellerUpstreamConfigs: snapshot.sellerUpstreamConfigs.map((config) => ({
      ...config,
      apiKeyCiphertext: cipher.encrypt(config.apiKeyCiphertext),
    })),
  };
}

export function decryptApiControlStateSnapshot(
  snapshot: Partial<ApiControlStateSnapshot> | undefined,
  cipher: SecretCipher
): Partial<ApiControlStateSnapshot> | undefined {
  if (!snapshot) {
    return snapshot;
  }

  const sellerUpstreamConfigs = Array.isArray(snapshot.sellerUpstreamConfigs)
    ? snapshot.sellerUpstreamConfigs.map((config) => ({
        ...config,
        apiKeyCiphertext:
          typeof config.apiKeyCiphertext === 'string'
            ? cipher.decrypt(config.apiKeyCiphertext)
            : config.apiKeyCiphertext,
      }))
    : snapshot.sellerUpstreamConfigs;

  const legacyVenice = Array.isArray(snapshot.sellerVeniceConfigs)
    ? snapshot.sellerVeniceConfigs.map((config) => ({
        ...config,
        apiKeyCiphertext:
          typeof config.apiKeyCiphertext === 'string'
            ? cipher.decrypt(config.apiKeyCiphertext)
            : config.apiKeyCiphertext,
      }))
    : snapshot.sellerVeniceConfigs;

  return {
    ...snapshot,
    opsSessions: Array.isArray(snapshot.opsSessions)
      ? snapshot.opsSessions.map((session) => ({
          ...session,
          token: typeof session.token === 'string' ? cipher.decrypt(session.token) : session.token,
        }))
      : snapshot.opsSessions,
    publicAuthNonces: Array.isArray(snapshot.publicAuthNonces)
      ? snapshot.publicAuthNonces.map((nonce) => ({
          ...nonce,
          nonce: typeof nonce.nonce === 'string' ? cipher.decrypt(nonce.nonce) : nonce.nonce,
        }))
      : snapshot.publicAuthNonces,
    publicSessions: Array.isArray(snapshot.publicSessions)
      ? snapshot.publicSessions.map((session) => ({
          ...session,
          token: typeof session.token === 'string' ? cipher.decrypt(session.token) : session.token,
        }))
      : snapshot.publicSessions,
    buyerApiKeys: Array.isArray(snapshot.buyerApiKeys)
      ? snapshot.buyerApiKeys.map((key) => ({
          ...key,
          keyHash: typeof key.keyHash === 'string' ? cipher.decrypt(key.keyHash) : key.keyHash,
        }))
      : snapshot.buyerApiKeys,
    sellerUpstreamConfigs,
    sellerVeniceConfigs: legacyVenice,
  };
}
