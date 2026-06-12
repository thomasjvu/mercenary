import { LoadingPulse } from '@bossraid/ui';
import type { MarketsResponse } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';

type MarketStatsRibbonProps = {
  markets?: MarketsResponse;
  isLoading?: boolean;
  variant?: 'default' | 'quest';
};

export function MarketStatsRibbon({
  markets,
  isLoading = false,
  variant = 'quest',
}: MarketStatsRibbonProps) {
  const stats = markets?.stats;
  const isQuest = variant === 'quest';

  if (isLoading && !markets) {
    return (
      <section
        aria-label="Marketplace statistics"
        className={`market-stats-ribbon${isQuest ? ' market-stats-ribbon--quest' : ''}`}
      >
        <LoadingPulse label="loading market stats" lines={6} />
      </section>
    );
  }

  return (
    <section
      aria-label="Marketplace statistics"
      className={`market-stats-ribbon${isQuest ? ' market-stats-ribbon--quest' : ''}`}
    >
      <Stat isQuest={isQuest} label="models live" value={String(stats?.modelsLive ?? 0)} />
      <Stat isQuest={isQuest} label="active offers" value={String(stats?.activeOffers ?? 0)} />
      <Stat isQuest={isQuest} label="routed 24h" value={String(stats?.routedRequests24h ?? 0)} />
      <Stat
        isQuest={isQuest}
        label="seller volume 24h"
        value={formatUsd(stats?.earnedBySellers24hUsd ?? 0, 2)}
      />
      <Stat isQuest={isQuest} label="settlement" value={markets?.settlement.asset ?? 'USDC'} />
      <Stat isQuest={isQuest} label="network" value={markets?.settlement.network ?? 'n/a'} />
    </section>
  );
}

function Stat({ label, value, isQuest }: { label: string; value: string; isQuest: boolean }) {
  return (
    <div
      className={`market-stats-ribbon__stat${isQuest ? ' market-stats-ribbon__stat--quest' : ''}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
