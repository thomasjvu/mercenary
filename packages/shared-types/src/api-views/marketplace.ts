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

export type BuyerPurchaseView = {
  id: string;
  wallet: string;
  apiKeyId?: string;
  raidId: string;
  modelId?: string;
  sellerId?: string;
  costUsd: number;
  reservedUsd?: number;
  route: 'raid' | 'chat' | 'balance' | 'bounty';
  /** charged | hold_released | refunded — missing treated as charged */
  status?: 'charged' | 'hold_released' | 'refunded';
  reason?: string;
  createdAt: string;
};

export type BuyerPurchasesResponseView = {
  object: 'list';
  totalSpentUsd: number;
  totalRefundedOrReleasedUsd?: number;
  chargedCount?: number;
  releasedCount?: number;
  refundedCount?: number;
  data: BuyerPurchaseView[];
};

export type SellerModelDemandView = {
  modelId: string;
  displayName: string;
  routedRequests24h: number;
  routedValue24hUsd: number;
  offerStatus: 'active' | 'paused';
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
  modelDemand: SellerModelDemandView[];
};

export type SellerProviderCreateResponseView = {
  provider: ProviderViewResponse;
  health: ProviderHealthViewResponse;
};
