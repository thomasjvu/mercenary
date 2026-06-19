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
} from './validators.js';
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
    relayerTasks: [],
    x402Reconciliations: [],
    x402SettledPayments: [],
    agentPaymentSessions: [],
    settings: {
      x402Enabled: false,
      seeded: false,
    },
  };
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
    sellerUpstreamConfigs: Array.isArray(snapshot?.sellerUpstreamConfigs)
      ? snapshot.sellerUpstreamConfigs.filter(isValidSellerUpstreamConfigEntry)
      : [],
    rateLimits: Array.isArray(snapshot?.rateLimits)
      ? snapshot.rateLimits.filter(isValidRateLimitEntry)
      : [],
    relayerTasks: Array.isArray(snapshot?.relayerTasks) ? snapshot.relayerTasks : [],
    x402Reconciliations: Array.isArray(snapshot?.x402Reconciliations)
      ? snapshot.x402Reconciliations
      : [],
    x402SettledPayments: Array.isArray(snapshot?.x402SettledPayments)
      ? snapshot.x402SettledPayments
      : [],
    agentPaymentSessions: Array.isArray(snapshot?.agentPaymentSessions)
      ? snapshot.agentPaymentSessions
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
  };
}
