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
