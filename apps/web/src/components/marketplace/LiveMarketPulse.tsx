import useSWR from 'swr';
import { fetchMarkets } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';

export function LiveMarketPulse() {
  const markets = useSWR('landing-markets', () => fetchMarkets(), { refreshInterval: 30_000 });
  const stats = markets.data?.stats;
  const topModels = (markets.data?.data ?? []).slice(0, 4);

  return (
    <section aria-label="Live marketplace pulse" className="live-market-pulse">
      <div className="live-market-pulse__stats">
        <span>{stats?.modelsLive ?? 0} models live</span>
        <span>{stats?.activeOffers ?? 0} active offers</span>
        <span>{stats?.routedRequests24h ?? 0} routed / 24h</span>
        <span>{formatUsd(stats?.earnedBySellers24hUsd ?? 0)} seller volume / 24h</span>
      </div>
      <div className="live-market-pulse__models">
        {topModels.map((market) => (
          <span className="live-market-pulse__chip" key={market.modelId}>
            {market.modelId} · {formatUsd(market.cheapestRateUsd)}
          </span>
        ))}
      </div>
    </section>
  );
}
