import { INFERENCE_MODEL_CATALOG, resolveMarketplacePrivacyTier } from '@bossraid/constants';
import type { InferenceMarket } from '../api/marketplace.js';

export type MarketplaceTrustFilter = 'any' | 'tee' | 'e2ee' | 'private' | 'anonymous';

const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export function marketMatchesTrustFilter(
  market: InferenceMarket,
  trust: MarketplaceTrustFilter
): boolean {
  if (trust === 'any') {
    return true;
  }

  const catalog = catalogById.get(market.modelId);
  const tier =
    market.privacyTier ??
    resolveMarketplacePrivacyTier({
      privacy: catalog?.privacy,
      teeAttested: catalog?.teeAttested,
      e2ee: catalog?.e2ee,
      modelProvider: catalog?.modelProvider ?? market.modelProvider,
    });

  if (trust === 'tee') {
    return (
      catalog?.teeAttested === true ||
      tier === 'upstream_tee' ||
      market.sellers.some((seller) => seller.privacy.teeAttested)
    );
  }

  if (trust === 'e2ee') {
    return (
      catalog?.e2ee === true ||
      tier === 'e2ee' ||
      market.sellers.some((seller) => seller.privacy.e2ee)
    );
  }

  if (trust === 'anonymous') {
    return (
      tier === 'anonymous_private' ||
      (market.anonymousSellerCount ?? 0) > 0 ||
      (!catalog?.teeAttested &&
        !catalog?.e2ee &&
        (catalog?.modelProvider === 'xai' ||
          catalog?.modelProvider === 'anthropic' ||
          catalog?.modelProvider === 'darkbloom' ||
          catalog?.modelProvider === 'zai'))
    );
  }

  // "private" = any privacy-adjacent claim (TEE, E2EE, anonymous indirection, signed, no-retain)
  return (
    tier !== 'standard' ||
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
