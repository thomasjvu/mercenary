import useSWR from 'swr';
import { LoadingPulse } from '@bossraid/ui';
import { fetchMarkets } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';
import { readApiErrorMessage } from '../../lib/api-readiness.js';

type LiveMarketPulseProps = {
  compact?: boolean;
};

export function LiveMarketPulse({ compact = false }: LiveMarketPulseProps) {
  const markets = useSWR('landing-markets', () => fetchMarkets(), { refreshInterval: 30_000 });
  const stats = markets.data?.stats;
  const topModels = (markets.data?.data ?? []).slice(0, compact ? 2 : 4);

  if (markets.isLoading && !markets.data) {
    return (
      <section
        aria-label="Live marketplace pulse"
        className={`live-market-pulse${compact ? ' live-market-pulse--compact' : ''}`}
      >
        <LoadingPulse label="syncing market" lines={compact ? 2 : 4} />
      </section>
    );
  }

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
      className={`live-market-pulse${compact ? ' live-market-pulse--compact' : ''}`}
    >
      <div className="live-market-pulse__stats">
        <span className="live-market-pulse__stat">{stats?.modelsLive ?? 0} models</span>
        <span className="live-market-pulse__stat">{stats?.activeOffers ?? 0} offers</span>
        <span className="live-market-pulse__stat">
          {formatUsd(stats?.earnedBySellers24hUsd ?? 0)} / 24h
        </span>
      </div>
      {!compact && topModels.length > 0 ? (
        <div className="live-market-pulse__models">
          {topModels.map((market) => (
            <span className="live-market-pulse__chip" key={market.modelId}>
              {market.modelId} · {formatUsd(market.cheapestRateUsd)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
