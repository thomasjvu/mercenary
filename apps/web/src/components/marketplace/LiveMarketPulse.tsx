import useSWR from 'swr';
import { fetchMarkets } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';
import { readApiErrorMessage } from '../../lib/api-readiness.js';

export function LiveMarketPulse() {
  const markets = useSWR('landing-markets', () => fetchMarkets(), { refreshInterval: 30_000 });
  const stats = markets.data?.stats;
  const topModels = (markets.data?.data ?? []).slice(0, 4);

  if (markets.error) {
    return (
      <section
        aria-label="Live marketplace pulse"
        className="live-market-pulse live-market-pulse--error"
      >
        <p className="live-market-pulse__error">{readApiErrorMessage(markets.error)}</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Live marketplace pulse"
      className="live-market-pulse live-market-pulse--quest"
    >
      <p className="live-market-pulse__label">live quest board</p>
      <div className="live-market-pulse__stats">
        <span className="live-market-pulse__stat">{stats?.modelsLive ?? 0} models</span>
        <span className="live-market-pulse__stat">{stats?.activeOffers ?? 0} offers</span>
        <span className="live-market-pulse__stat">
          {formatUsd(stats?.earnedBySellers24hUsd ?? 0)} / 24h
        </span>
      </div>
      <div className="live-market-pulse__models">
        {topModels.map((market) => (
          <span className="live-market-pulse__chip quest-pixel-chip" key={market.modelId}>
            {market.modelId} · {formatUsd(market.cheapestRateUsd)}
          </span>
        ))}
      </div>
    </section>
  );
}
