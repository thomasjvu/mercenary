import type {
  BuyerPurchaseView,
  BuyerPurchasesResponseView,
  InferenceMarketView,
  MarketplaceStatsView,
  MarketsResponseView,
  ModelsResponseView,
  SellerStatsView,
} from '@bossraid/shared-types';
import { fetchJson } from './client.js';

export type InferenceMarketSeller = InferenceMarketView['sellers'][number];
export type InferenceMarket = InferenceMarketView;
export type MarketplaceStats = MarketplaceStatsView;
export type MarketsResponse = MarketsResponseView;
export type OpenAiModelEntry = ModelsResponseView['data'][number];
export type ModelsResponse = ModelsResponseView;
export type BuyerPurchase = BuyerPurchaseView;
export type BuyerPurchasesResponse = BuyerPurchasesResponseView;
export type SellerStats = SellerStatsView;

export async function fetchMarkets(params: Record<string, string> = {}): Promise<MarketsResponse> {
  const query = new URLSearchParams(params);
  return fetchJson<MarketsResponse>(`/v1/markets${query.size > 0 ? `?${query.toString()}` : ''}`);
}

export async function fetchModels(params: Record<string, string> = {}): Promise<ModelsResponse> {
  const query = new URLSearchParams(params);
  return fetchJson<ModelsResponse>(`/v1/models${query.size > 0 ? `?${query.toString()}` : ''}`);
}

export async function fetchBuyerPurchases(limit = 50): Promise<BuyerPurchasesResponse> {
  return fetchJson<BuyerPurchasesResponse>(`/v1/buyer/purchases?limit=${limit}`);
}

export async function fetchMarketplaceStats(): Promise<
  MarketplaceStats & { sellerOffersActive?: number }
> {
  return fetchJson<MarketplaceStats & { sellerOffersActive?: number }>('/v1/marketplace/stats');
}

export async function fetchSellerStats(): Promise<SellerStats> {
  return fetchJson<SellerStats>('/v1/seller/stats');
}

/** Local smoke/tests only — production UI must use x402 paid fetch. */
export async function fundBuyerBalanceDevOnly(amountUsd: number): Promise<{
  wallet: string;
  balanceUsd: number;
  creditedUsd: number;
  currency: string;
}> {
  return fetchJson('/v1/buyer/balance/fund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amountUsd }),
  });
}

export async function runInferenceChatCompletion(input: {
  apiKey?: string;
  model: string;
  prompt: string;
  maxTotalCost?: number;
  privacyMode?: 'off' | 'prefer' | 'strict';
  upstreamApiKey?: string;
  stream?: boolean;
}): Promise<{
  content: string;
  raw: unknown;
}> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (input.apiKey?.trim()) {
    headers.authorization = `Bearer ${input.apiKey.trim()}`;
  }
  if (input.upstreamApiKey?.trim()) {
    headers['x-bossraid-upstream-api-key'] = input.upstreamApiKey.trim();
  }

  const strictE2ee = input.privacyMode === 'strict';
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [{ role: 'user', content: input.prompt }],
    stream: input.stream ?? false,
    raid_policy: {
      privacy_mode: input.privacyMode ?? 'prefer',
      ...(strictE2ee ? {} : { max_total_cost: input.maxTotalCost ?? 1 }),
    },
  };

  const payload = await fetchJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>('/v1/inference/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const content = payload.choices?.[0]?.message?.content ?? '';
  return { content, raw: payload };
}
