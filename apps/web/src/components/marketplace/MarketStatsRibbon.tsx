import { LoadingPulse } from '@bossraid/ui';
import type { MarketsResponse } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';

type MarketStatsRibbonProps = {
  markets?: MarketsResponse;
  isLoading?: boolean;
  isError?: boolean;
};

export function MarketStatsRibbon({
  markets,
  isLoading = false,
  isError = false,
}: MarketStatsRibbonProps) {
  const stats = markets?.stats;

  if (isLoading && !markets) {
    return (
      <section aria-label="Marketplace statistics" className="market-stats-ribbon">
        <LoadingPulse label="loading market stats" lines={6} />
      </section>
    );
  }

  return (
    <section aria-label="Marketplace statistics" className="market-stats-ribbon">
      {isError ? (
        <p aria-live="polite" className="market-stats-ribbon__status">
          {markets
            ? 'API refresh failed; showing the last successful snapshot.'
            : 'Live API unavailable; live counts are unknown.'}
        </p>
      ) : null}
      <Stat
        label="models live"
        value={isError && !markets ? '—' : String(stats?.modelsLive ?? '—')}
      />
      <Stat
        label="active offers"
        value={isError && !markets ? '—' : String(stats?.activeOffers ?? '—')}
      />
      <Stat
        label="routed 24h"
        value={isError && !markets ? '—' : String(stats?.routedRequests24h ?? '—')}
      />
      <Stat
        label="seller volume 24h"
        value={isError && !markets ? '—' : stats ? formatUsd(stats.earnedBySellers24hUsd, 2) : '—'}
      />
      <Stat label="settlement" value={markets?.settlement.asset ?? '—'} />
      <Stat label="network" value={markets?.settlement.network ?? '—'} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="market-stats-ribbon__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
