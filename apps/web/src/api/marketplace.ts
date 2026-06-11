import type {
  BuyerPurchaseView,
  BuyerPurchasesResponseView,
  InferenceMarketView,
  MarketplaceStatsView,
  MarketsResponseView,
  ModelsResponseView,
  SellerStatsView,
} from '@bossraid/shared-types';
import { API_BASE, fetchJson } from './client.js';

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

export async function fundBuyerBalance(amountUsd: number): Promise<{
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
  apiKey: string;
  model: string;
  prompt: string;
  maxTotalCost?: number;
}): Promise<{
  content: string;
  raw: unknown;
}> {
  const response = await fetch(`${API_BASE}/v1/inference/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      raid_policy: {
        max_total_cost: input.maxTotalCost ?? 1,
        privacy_mode: 'prefer',
      },
    }),
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Inference failed (${response.status})`);
  }

  const content = payload.choices?.[0]?.message?.content ?? '';
  return { content, raw: payload };
}
