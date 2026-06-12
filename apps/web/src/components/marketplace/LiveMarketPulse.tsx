import useSWR from 'swr';
import { LoadingPulse } from '@bossraid/ui';
import { fetchMarkets } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';
import { readApiErrorMessage } from '../../lib/api-readiness.js';

type LiveMarketPulseProps = {
  variant?: 'default' | 'quest';
};

export function LiveMarketPulse({ variant = 'default' }: LiveMarketPulseProps) {
  const markets = useSWR('landing-markets', () => fetchMarkets(), { refreshInterval: 30_000 });
  const stats = markets.data?.stats;
  const topModels = (markets.data?.data ?? []).slice(0, 4);
  const isQuest = variant === 'quest';

  if (markets.isLoading && !markets.data) {
    return (
      <section
        aria-label="Live marketplace pulse"
        className={`live-market-pulse${isQuest ? ' live-market-pulse--quest' : ''}`}
      >
        <LoadingPulse label="syncing quest board" lines={4} />
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
      className={`live-market-pulse${isQuest ? ' live-market-pulse--quest' : ''}`}
    >
      {isQuest ? <p className="live-market-pulse__label">live quest board</p> : null}
      <div className="live-market-pulse__stats">
        <span
          className={`live-market-pulse__stat${isQuest ? ' live-market-pulse__stat--quest' : ''}`}
        >
          {stats?.modelsLive ?? 0} models
        </span>
        <span
          className={`live-market-pulse__stat${isQuest ? ' live-market-pulse__stat--quest' : ''}`}
        >
          {stats?.activeOffers ?? 0} offers
        </span>
        <span
          className={`live-market-pulse__stat${isQuest ? ' live-market-pulse__stat--quest' : ''}`}
        >
          {formatUsd(stats?.earnedBySellers24hUsd ?? 0)} / 24h
        </span>
      </div>
      <div className="live-market-pulse__models">
        {topModels.map((market) => (
          <span
            className={`live-market-pulse__chip${isQuest ? ' quest-pixel-chip' : ''}`}
            key={market.modelId}
          >
            {market.modelId} · {formatUsd(market.cheapestRateUsd)}
          </span>
        ))}
      </div>
    </section>
  );
}
