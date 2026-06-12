import type { ProviderHealthViewResponse, ProviderViewResponse } from './provider.js';

export type SellerEarningsView = {
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

export type InferenceMarketSellerView = {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: ProviderViewResponse['agentFramework'];
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

export type InferenceMarketView = {
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
  sellers: InferenceMarketSellerView[];
};

export type MarketplaceStatsView = {
  activeOffers: number;
  modelsLive: number;
  routedRequests24h: number;
  earnedBySellers24hUsd: number;
};

export type MarketsResponseView = {
  object: 'list';
  stats: MarketplaceStatsView;
  settlement: {
    asset: string;
    network: string;
    rule: string;
  };
  custody: {
    sellerCredentialPolicy: string;
    privacyPolicy: string;
  };
  data: InferenceMarketView[];
};

export type OpenAiModelEntryView = {
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

export type ModelsResponseView = {
  object: 'list';
  data: OpenAiModelEntryView[];
};

export type BuyerPurchaseView = {
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

export type BuyerPurchasesResponseView = {
  object: 'list';
  totalSpentUsd: number;
  totalSavingsUsd: number;
  data: BuyerPurchaseView[];
};

export type SellerStatsView = {
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

export type SellerProviderCreateResponseView = {
  provider: ProviderViewResponse;
  health: ProviderHealthViewResponse;
};
