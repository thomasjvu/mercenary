import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets } from '../api';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import {
  MARKETPLACE_FILTER_DEFAULTS,
  buildMarketplaceQueryParams,
  hasActiveMarketplaceFilters,
  type MarketplaceFilters,
} from '../lib/marketplace-filters.js';
import { marketMatchesTrustFilter } from '../lib/marketplace-trust.js';

export function useMarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>(MARKETPLACE_FILTER_DEFAULTS);
  const params = useMemo(() => buildMarketplaceQueryParams(filters), [filters]);
  const filtersActive = useMemo(() => hasActiveMarketplaceFilters(filters), [filters]);
  const markets = useSWR(
    ['markets', params.toString()],
    () => fetchMarkets(Object.fromEntries(params.entries())),
    { refreshInterval: 15_000 }
  );
  const allMarkets = useSWR(['markets', 'all'], () => fetchMarkets(), { refreshInterval: 15_000 });
  const visibleMarkets = markets.data?.data ?? [];
  const trustFilteredMarkets = useMemo(
    () => visibleMarkets.filter((market) => marketMatchesTrustFilter(market, filters.trust)),
    [filters.trust, visibleMarkets]
  );
  const totalMarketCount = allMarkets.data?.data.length ?? 0;
  const spotlightModel = visibleMarkets[0]?.modelId ?? 'gpt-5.5';
  const spotlightCurl = useMemo(
    () =>
      buildInferenceCurlSnippet({
        apiBase: API_BASE,
        model: spotlightModel,
        prompt: 'Run on the cheapest verified seller.',
        maxBudgetUsd: 1,
        privacyMode: 'prefer',
        relativePath: true,
      }),
    [spotlightModel]
  );

  function resetFilters() {
    setFilters({ ...MARKETPLACE_FILTER_DEFAULTS });
  }

  function patchFilters(patch: Partial<MarketplaceFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  return {
    filters,
    setFilters,
    patchFilters,
    resetFilters,
    filtersActive,
    markets,
    allMarkets,
    trustFilteredMarkets,
    totalMarketCount,
    spotlightModel,
    spotlightCurl,
  };
}

export type MarketplacePageState = ReturnType<typeof useMarketplacePage>;
