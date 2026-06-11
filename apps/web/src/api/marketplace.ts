import { API_BASE, fetchJson } from './client.js';
import type { Provider } from './client.js';

export type InferenceMarketSeller = {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: Provider['agentFramework'];
  rateUsd: number;
  status: string;
  marketplaceOfferStatus?: 'active' | 'paused';
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'error';
  privacy: {
    teeAttested?: boolean;
    e2ee?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
  outputTypes?: string[];
  maxConcurrency: number;
  pricing: {
    unit: 'task' | 'token_metered';
    pricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    minimumChargeUsd: number | null;
    currency: string;
    upstreamModelId?: string;
    maxContextTokens?: number;
  };
};

export type InferenceMarket = {
  object: 'inference.market';
  modelId: string;
  modelProvider?: string;
  providerCount: number;
  activeProviderCount: number;
  verifiedSellerCount: number;
  privateSellerCount: number;
  recentSuccessRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  cheapestRateUsd: number | null;
  pricing: {
    benchmarkSource: 'models.dev';
    benchmarkUrl: string;
    benchmarkMode: 'static_reference_only';
    declaredUnit: 'task' | 'token_metered';
    cheapestPricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    referenceInputTokens: number | null;
    referenceOutputTokens: number | null;
  };
  sellers: InferenceMarketSeller[];
};

export type MarketplaceStats = {
  activeOffers: number;
  modelsLive: number;
  routedRequests24h: number;
  earnedBySellers24hUsd: number;
};

export type MarketsResponse = {
  object: 'list';
  stats: MarketplaceStats;
  settlement: {
    asset: string;
    network: string;
    rule: string;
  };
  custody: {
    sellerCredentialPolicy: string;
    privacyPolicy: string;
  };
  data: InferenceMarket[];
};

export type OpenAiModelEntry = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  bossraid?: {
    cheapest_rate_usd?: number | null;
    active_seller_count?: number;
    verified_seller_count?: number;
    model_provider?: string;
  };
};

export type ModelsResponse = {
  object: 'list';
  data: OpenAiModelEntry[];
};

export type BuyerPurchase = {
  id: string;
  wallet: string;
  apiKeyId?: string;
  raidId: string;
  modelId?: string;
  sellerId?: string;
  costUsd: number;
  benchmarkPriceUsd?: number;
  savingsUsd?: number;
  route: 'raid' | 'chat' | 'inference';
  createdAt: string;
};

export type BuyerPurchasesResponse = {
  object: 'list';
  totalSpentUsd: number;
  totalSavingsUsd: number;
  data: BuyerPurchase[];
};

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

export type SellerStats = {
  grossUsd: number;
  payoutCount: number;
  earnings24hUsd: number;
  routedRequests24h: number;
  activeOffers: number;
  pausedOffers: number;
  providers: Array<{
    providerId: string;
    displayName: string;
    modelId?: string;
    marketplaceOfferStatus: 'active' | 'paused';
    verificationStatus?: string;
  }>;
};

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
