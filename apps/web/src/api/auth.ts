import { fetchJson, type Provider, type ProviderHealth } from './client.js';

export type BuyerApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
};

export type PublicSession = {
  authenticated: boolean;
  wallet?: string;
  account?: {
    wallet: string;
    createdAt: string;
    balanceUsd?: number;
    sellerProviderIds: string[];
    apiKeys: BuyerApiKey[];
    totalSavingsUsd?: number;
  };
};

export type AuthNonceResponse = {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type ApiKeyCreateResponse = {
  apiKey: string;
  key: BuyerApiKey;
};

export type SellerProviderCreateResponse = {
  provider: Provider;
  health: ProviderHealth;
};

export type SellerEarnings = {
  grossUsd: number;
  payoutCount: number;
  payouts: Array<{
    raidId: string;
    providerId: string;
    amountUsd: number;
    status: string;
    settledAt?: string;
  }>;
};

export async function createAuthNonce(wallet: string): Promise<AuthNonceResponse> {
  return fetchJson<AuthNonceResponse>('/v1/auth/nonce', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ wallet }),
  });
}

export async function verifyAuth(wallet: string, message: string, signature: string) {
  return fetchJson<PublicSession>('/v1/auth/verify', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ wallet, message, signature }),
  });
}

export async function fetchSession(): Promise<PublicSession> {
  return fetchJson<PublicSession>('/v1/session');
}

export async function deleteSession(): Promise<PublicSession> {
  return fetchJson<PublicSession>('/v1/session', { method: 'DELETE' });
}

export async function listBuyerApiKeys(): Promise<{ object: 'list'; data: BuyerApiKey[] }> {
  return fetchJson<{ object: 'list'; data: BuyerApiKey[] }>('/v1/buyer/api-keys');
}

export async function createBuyerApiKey(payload: {
  name: string;
  spendLimitUsd?: number;
}): Promise<ApiKeyCreateResponse> {
  return fetchJson<ApiKeyCreateResponse>('/v1/buyer/api-keys', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteBuyerApiKey(keyId: string): Promise<{ revoked: boolean }> {
  return fetchJson<{ revoked: boolean }>(`/v1/buyer/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

export async function listSellerProviders(): Promise<{ object: 'list'; data: Provider[] }> {
  return fetchJson<{ object: 'list'; data: Provider[] }>('/v1/seller/providers');
}

export async function createSellerProvider(
  payload: unknown
): Promise<SellerProviderCreateResponse> {
  return fetchJson<SellerProviderCreateResponse>('/v1/seller/providers', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function updateSellerProvider(
  providerId: string,
  payload: Record<string, unknown>
): Promise<Provider> {
  return fetchJson<Provider>(`/v1/seller/providers/${encodeURIComponent(providerId)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function verifySellerProvider(
  providerId: string
): Promise<SellerProviderCreateResponse> {
  return fetchJson<SellerProviderCreateResponse>(
    `/v1/seller/providers/${encodeURIComponent(providerId)}/verify`,
    {
      method: 'POST',
    }
  );
}

export async function fetchSellerEarnings(): Promise<SellerEarnings> {
  return fetchJson<SellerEarnings>('/v1/seller/earnings');
}

export type { BuyerPurchase, BuyerPurchasesResponse, SellerStats } from './marketplace.js';
export { fetchBuyerPurchases, fetchSellerStats, fundBuyerBalance } from './marketplace.js';
