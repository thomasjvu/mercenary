import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { InferenceMarket } from '../api/marketplace.js';

export type MarketplaceTrustFilter = 'any' | 'tee' | 'e2ee' | 'private';

const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export function marketMatchesTrustFilter(
  market: InferenceMarket,
  trust: MarketplaceTrustFilter
): boolean {
  if (trust === 'any') {
    return true;
  }

  const catalog = catalogById.get(market.modelId);

  if (trust === 'tee') {
    return (
      catalog?.teeAttested === true || market.sellers.some((seller) => seller.privacy.teeAttested)
    );
  }

  if (trust === 'e2ee') {
    return catalog?.e2ee === true || market.sellers.some((seller) => seller.privacy.e2ee);
  }

  return (
    (market.privateSellerCount ?? 0) > 0 ||
    market.sellers.some(
      (seller) =>
        seller.privacy.teeAttested ||
        seller.privacy.e2ee ||
        seller.privacy.signedOutputs ||
        seller.privacy.noDataRetention
    )
  );
}
