import { fetchJson } from './client.js';
import type { Provider } from './client.js';

export type InferenceMarketSeller = {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: Provider['agentFramework'];
  rateUsd: number;
  status: string;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'error';
  privacy: {
    teeAttested?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
  outputTypes?: string[];
  maxConcurrency: number;
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
    declaredUnit: 'task';
    cheapestPricePerTaskUsd: number | null;
  };
  sellers: InferenceMarketSeller[];
};

export async function fetchMarkets(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  return fetchJson<{ object: 'list'; data: InferenceMarket[] }>(
    `/v1/markets${query.size > 0 ? `?${query.toString()}` : ''}`
  );
}
