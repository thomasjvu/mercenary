import useSWR from 'swr';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { fetchMarkets, type ProviderHealth } from '../api';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  resolveMarketBenchmarkTaskUsd,
} from '../lib/marketplace-benchmark.js';
import { formatSavingsLabel } from '../lib/marketplace-format.js';
import {
  buildModelDetailStats,
  resolveModelAttestationProvider,
} from '../lib/model-detail-view.js';

export function useModelDetailPage(modelId: string, providerHealth: ProviderHealth[]) {
  const markets = useSWR(['market-detail', modelId], () => fetchMarkets({ model_id: modelId }));
  const market = markets.data?.data[0];
  const healthBySellerId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === modelId);
  const attestationProvider = resolveModelAttestationProvider(catalogEntry);
  const benchmark = market ? resolveMarketBenchmarkTaskUsd(market) : undefined;
  const savingsUsd = computeSavingsUsd(benchmark, market?.cheapestRateUsd);
  const savingsPercent = computeSavingsPercent(benchmark, market?.cheapestRateUsd);
  const savingsLabel = formatSavingsLabel(savingsUsd, savingsPercent);
  const stats = market ? buildModelDetailStats(market) : [];

  return {
    markets,
    market,
    healthBySellerId,
    catalogEntry,
    attestationProvider,
    savingsLabel,
    stats,
  };
}

export type ModelDetailPageState = ReturnType<typeof useModelDetailPage>;
