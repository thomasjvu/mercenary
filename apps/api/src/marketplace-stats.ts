import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { SellerPayoutEntry } from './control-state.js';

export const MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT = 10_000;
export const SELLER_PAYOUT_STORE_LIMIT = MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT;
export const MARKETPLACE_STATS_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function computeSellerPayout24hMetrics(
  payouts: SellerPayoutEntry[],
  nowMs = Date.now()
): {
  routedRequests24h: number;
  earnedBySellers24hUsd: number;
} {
  const since24h = nowMs - MARKETPLACE_STATS_WINDOW_MS;
  const recent = payouts.filter((entry) => Date.parse(entry.createdAt) >= since24h);
  return {
    routedRequests24h: recent.length,
    earnedBySellers24hUsd: recent.reduce((sum, entry) => sum + entry.grossUsd, 0),
  };
}

export function computeSellerModelDemand(input: {
  payouts: SellerPayoutEntry[];
  providers: Array<{
    providerId: string;
    displayName: string;
    modelId?: string;
    marketplaceOfferStatus?: 'active' | 'paused';
  }>;
  nowMs?: number;
  limit?: number;
}): Array<{
  modelId: string;
  displayName: string;
  routedRequests24h: number;
  routedValue24hUsd: number;
  referenceInputPer1mUsd: number | null;
  referenceOutputPer1mUsd: number | null;
  offerStatus: 'active' | 'paused';
}> {
  const nowMs = input.nowMs ?? Date.now();
  const since24h = nowMs - MARKETPLACE_STATS_WINDOW_MS;
  const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));
  const providerById = new Map(input.providers.map((entry) => [entry.providerId, entry]));
  const byModel = new Map<
    string,
    {
      modelId: string;
      displayName: string;
      routedRequests24h: number;
      routedValue24hUsd: number;
      referenceInputPer1mUsd: number | null;
      referenceOutputPer1mUsd: number | null;
      offerStatus: 'active' | 'paused';
    }
  >();

  for (const provider of input.providers) {
    if (!provider.modelId) {
      continue;
    }
    const catalog = catalogById.get(provider.modelId);
    byModel.set(provider.modelId, {
      modelId: provider.modelId,
      displayName: provider.displayName ?? catalog?.displayName ?? provider.modelId,
      routedRequests24h: 0,
      routedValue24hUsd: 0,
      referenceInputPer1mUsd: catalog?.inputPer1mUsd ?? null,
      referenceOutputPer1mUsd: catalog?.outputPer1mUsd ?? null,
      offerStatus: provider.marketplaceOfferStatus ?? 'active',
    });
  }

  for (const payout of input.payouts) {
    if (Date.parse(payout.createdAt) < since24h) {
      continue;
    }
    const provider = providerById.get(payout.providerId);
    const modelId = provider?.modelId;
    if (!modelId) {
      continue;
    }
    const existing = byModel.get(modelId);
    if (!existing) {
      continue;
    }
    byModel.set(modelId, {
      ...existing,
      routedRequests24h: existing.routedRequests24h + 1,
      routedValue24hUsd: Number((existing.routedValue24hUsd + payout.grossUsd).toFixed(6)),
    });
  }

  return [...byModel.values()]
    .sort(
      (left, right) =>
        right.routedValue24hUsd - left.routedValue24hUsd ||
        right.routedRequests24h - left.routedRequests24h ||
        left.modelId.localeCompare(right.modelId)
    )
    .slice(0, Math.max(1, input.limit ?? 12));
}
