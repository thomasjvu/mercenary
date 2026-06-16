import type { InferenceCatalogEntry } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { InferenceMarket } from '../api/marketplace.js';
import { formatLatency, formatPercent } from './marketplace-format.js';
import {
  formatPer1mTokenPrice,
  resolveMarketBaseInputPer1mUsd,
  resolveMarketBaseOutputPer1mUsd,
} from './marketplace-pricing.js';

export type ModelDetailStat = {
  label: string;
  value: string;
};

export function resolveModelAttestationProvider(
  catalogEntry: InferenceCatalogEntry | undefined
): UpstreamProviderId {
  if (catalogEntry?.attestationVendor && isUpstreamProviderId(catalogEntry.attestationVendor)) {
    return catalogEntry.attestationVendor;
  }
  if (catalogEntry?.modelProvider && isUpstreamProviderId(catalogEntry.modelProvider)) {
    return catalogEntry.modelProvider;
  }
  return 'venice';
}

export function countTeeSellers(market: InferenceMarket): number {
  return market.sellers.filter((seller) => seller.privacy.teeAttested).length;
}

export function buildModelDetailStats(market: InferenceMarket): ModelDetailStat[] {
  return [
    {
      label: 'sellers',
      value: `${market.activeProviderCount}/${market.providerCount}`,
    },
    { label: 'verified', value: String(market.verifiedSellerCount) },
    { label: 'tee', value: String(countTeeSellers(market)) },
    { label: 'private', value: String(market.privateSellerCount) },
    { label: 'success', value: formatPercent(market.recentSuccessRate) },
    { label: 'p50', value: formatLatency(market.p50LatencyMs) },
    { label: 'p95', value: formatLatency(market.p95LatencyMs) },
    { label: 'unit', value: market.pricing.declaredUnit },
    {
      label: 'base in',
      value: formatPer1mTokenPrice(resolveMarketBaseInputPer1mUsd(market)),
    },
    {
      label: 'base out',
      value: formatPer1mTokenPrice(resolveMarketBaseOutputPer1mUsd(market)),
    },
  ];
}
