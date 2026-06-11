import type { MarketsResponse } from '../../api/marketplace.js';
import { formatUsd } from '../../lib/marketplace-format.js';

export function MarketStatsRibbon({ markets }: { markets?: MarketsResponse }) {
  const stats = markets?.stats;

  return (
    <section aria-label="Marketplace statistics" className="market-stats-ribbon">
      <Stat label="models live" value={String(stats?.modelsLive ?? 0)} />
      <Stat label="active offers" value={String(stats?.activeOffers ?? 0)} />
      <Stat label="routed 24h" value={String(stats?.routedRequests24h ?? 0)} />
      <Stat label="seller volume 24h" value={formatUsd(stats?.earnedBySellers24hUsd ?? 0, 2)} />
      <Stat label="settlement" value={markets?.settlement.asset ?? 'USDC'} />
      <Stat label="network" value={markets?.settlement.network ?? 'n/a'} />
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
