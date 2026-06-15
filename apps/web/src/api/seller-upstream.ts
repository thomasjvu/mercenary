import {
  getUpstreamDisplayName,
  UPSTREAM_PROVIDER_IDS,
  type UpstreamProviderId,
} from '@bossraid/constants';
import { fetchJson } from './client.js';

export type UpstreamCatalogModel = {
  modelId: string;
  displayName: string;
  modelProvider?: UpstreamProviderId;
  supported: boolean;
  upstreamFound: boolean;
  teeAttested: boolean;
  e2ee: boolean;
  maxContextTokens: number | null;
  referenceInputPer1mUsd: number | null;
  referenceOutputPer1mUsd: number | null;
};

export type SellerUpstreamConfig = {
  configId: string;
  wallet: string;
  provider: UpstreamProviderId;
  keyPrefix: string;
  upstreamBase: string;
  createdAt: string;
  updatedAt: string;
  configured: true;
};

export function upstreamProviderLabel(provider: UpstreamProviderId): string {
  return getUpstreamDisplayName(provider);
}

export async function connectSellerUpstream(provider: UpstreamProviderId, apiKey: string) {
  return fetchJson<{ object: string; config: SellerUpstreamConfig }>(
    `/v1/seller/upstream/${provider}/connect`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    }
  );
}

export async function fetchSellerUpstreamConfig(provider: UpstreamProviderId) {
  return fetchJson<{ object: string; configured: boolean; config?: SellerUpstreamConfig }>(
    `/v1/seller/upstream/${provider}/config`
  );
}

export async function fetchSellerUpstreamStatus() {
  return fetchJson<{
    object: string;
    providers: SellerUpstreamConfig[];
  }>('/v1/seller/upstream/status');
}

export async function fetchSellerUpstreamCatalogModels(provider: UpstreamProviderId) {
  return fetchJson<{
    object: 'list';
    provider: UpstreamProviderId;
    catalogOnly: true;
    supportedCount: number;
    upstreamFoundCount: number;
    data: UpstreamCatalogModel[];
  }>(`/v1/seller/upstream/${provider}/models/catalog`);
}

export async function fetchSellerUpstreamModels(provider: UpstreamProviderId) {
  return fetchJson<{
    object: 'list';
    provider: UpstreamProviderId;
    upstreamCount: number;
    supportedCount: number;
    upstreamFoundCount: number;
    data: UpstreamCatalogModel[];
  }>(`/v1/seller/upstream/${provider}/models`);
}

export async function publishSellerUpstreamOffers(
  provider: UpstreamProviderId,
  payload: {
    modelIds: string[];
    discountPercent: number;
    payoutWallet?: string;
  }
) {
  return fetchJson<{
    object: string;
    provider: UpstreamProviderId;
    discountPercent: number;
    payoutWallet: string;
    providers: Array<{
      modelId: string;
      providerId: string;
      verificationStatus: string;
    }>;
  }>(`/v1/seller/upstream/${provider}/offers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function pauseSellerUpstreamOffer(provider: UpstreamProviderId, modelId: string) {
  return fetchJson(`/v1/seller/upstream/${provider}/offers/${encodeURIComponent(modelId)}`, {
    method: 'DELETE',
  });
}

export type VeniceCatalogModel = UpstreamCatalogModel;

export { UPSTREAM_PROVIDER_IDS };
