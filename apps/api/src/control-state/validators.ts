import type {
  ApiOpsSessionEntry,
  ApiRateLimitEntry,
  BuyerApiKeyEntry,
  BuyerPurchaseEntry,
  PublicAccountEntry,
  PublicAuthNonceEntry,
  PublicSessionEntry,
  SellerPayoutEntry,
  SellerUpstreamConfigEntry,
} from './types.js';

export function isValidOpsSessionEntry(value: unknown): value is ApiOpsSessionEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ApiOpsSessionEntry).token === 'string' &&
    typeof (value as ApiOpsSessionEntry).expiresAt === 'number' &&
    Number.isFinite((value as ApiOpsSessionEntry).expiresAt)
  );
}

export function isValidRateLimitEntry(value: unknown): value is ApiRateLimitEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ApiRateLimitEntry).key === 'string' &&
    typeof (value as ApiRateLimitEntry).count === 'number' &&
    Number.isFinite((value as ApiRateLimitEntry).count) &&
    typeof (value as ApiRateLimitEntry).resetAt === 'number' &&
    Number.isFinite((value as ApiRateLimitEntry).resetAt)
  );
}

export function isValidPublicAuthNonceEntry(value: unknown): value is PublicAuthNonceEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicAuthNonceEntry).nonce === 'string' &&
    typeof (value as PublicAuthNonceEntry).expiresAt === 'number' &&
    Number.isFinite((value as PublicAuthNonceEntry).expiresAt)
  );
}

export function isValidPublicSessionEntry(value: unknown): value is PublicSessionEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicSessionEntry).token === 'string' &&
    typeof (value as PublicSessionEntry).wallet === 'string' &&
    typeof (value as PublicSessionEntry).expiresAt === 'number' &&
    Number.isFinite((value as PublicSessionEntry).expiresAt)
  );
}

export function isValidPublicAccountEntry(value: unknown): value is PublicAccountEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicAccountEntry).wallet === 'string' &&
    typeof (value as PublicAccountEntry).createdAt === 'string' &&
    typeof (value as PublicAccountEntry).updatedAt === 'string' &&
    Array.isArray((value as PublicAccountEntry).sellerProviderIds) &&
    (typeof (value as PublicAccountEntry).balanceUsd === 'number' ||
      (value as PublicAccountEntry).balanceUsd === undefined)
  );
}

export function isValidBuyerPurchaseEntry(value: unknown): value is BuyerPurchaseEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as BuyerPurchaseEntry).id === 'string' &&
    typeof (value as BuyerPurchaseEntry).wallet === 'string' &&
    typeof (value as BuyerPurchaseEntry).raidId === 'string' &&
    typeof (value as BuyerPurchaseEntry).costUsd === 'number' &&
    ((value as BuyerPurchaseEntry).route === 'raid' ||
      (value as BuyerPurchaseEntry).route === 'chat' ||
      (value as BuyerPurchaseEntry).route === 'inference') &&
    typeof (value as BuyerPurchaseEntry).createdAt === 'string'
  );
}

export function isValidSellerPayoutEntry(value: unknown): value is SellerPayoutEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as SellerPayoutEntry).id === 'string' &&
    typeof (value as SellerPayoutEntry).providerId === 'string' &&
    typeof (value as SellerPayoutEntry).raidId === 'string' &&
    typeof (value as SellerPayoutEntry).grossUsd === 'number' &&
    typeof (value as SellerPayoutEntry).status === 'string' &&
    typeof (value as SellerPayoutEntry).createdAt === 'string'
  );
}

export function isValidBuyerApiKeyEntry(value: unknown): value is BuyerApiKeyEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as BuyerApiKeyEntry).id === 'string' &&
    typeof (value as BuyerApiKeyEntry).wallet === 'string' &&
    typeof (value as BuyerApiKeyEntry).name === 'string' &&
    typeof (value as BuyerApiKeyEntry).keyHash === 'string' &&
    typeof (value as BuyerApiKeyEntry).prefix === 'string' &&
    typeof (value as BuyerApiKeyEntry).createdAt === 'string' &&
    typeof (value as BuyerApiKeyEntry).spentUsd === 'number' &&
    ((value as BuyerApiKeyEntry).status === 'active' ||
      (value as BuyerApiKeyEntry).status === 'revoked')
  );
}

export function isValidSellerUpstreamConfigEntry(
  value: unknown
): value is SellerUpstreamConfigEntry {
  const provider = (value as SellerUpstreamConfigEntry).provider;
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as SellerUpstreamConfigEntry).configId === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).wallet === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).apiKeyCiphertext === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).keyPrefix === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).upstreamBase === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).createdAt === 'string' &&
    typeof (value as SellerUpstreamConfigEntry).updatedAt === 'string' &&
    (provider === undefined ||
      provider === 'venice' ||
      provider === 'redpill' ||
      provider === 'near' ||
      provider === 'chutes' ||
      provider === 'phala')
  );
}
