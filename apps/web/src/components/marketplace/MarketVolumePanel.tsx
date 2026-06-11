import type { MarketplaceStats } from '../../api/marketplace.js';
import { formatUsd } from '../../lib/marketplace-format.js';

export function MarketVolumePanel({ stats }: { stats?: MarketplaceStats }) {
  const rows = [
    {
      label: 'models live',
      value: stats?.modelsLive ?? 0,
      max: Math.max(stats?.modelsLive ?? 0, stats?.activeOffers ?? 0, 1),
    },
    {
      label: 'active offers',
      value: stats?.activeOffers ?? 0,
      max: Math.max(stats?.activeOffers ?? 0, stats?.modelsLive ?? 0, 1),
    },
    {
      label: 'routed 24h',
      value: stats?.routedRequests24h ?? 0,
      max: Math.max(stats?.routedRequests24h ?? 0, 1),
    },
    {
      label: 'seller $/24h',
      value: stats?.earnedBySellers24hUsd ?? 0,
      max: Math.max(stats?.earnedBySellers24hUsd ?? 0, 1),
      format: 'usd' as const,
    },
  ];

  return (
    <section aria-label="Marketplace volume" className="market-volume-panel">
      <p className="eyebrow">market pulse</p>
      <div className="market-volume-panel__bars">
        {rows.map((row) => {
          const width =
            row.format === 'usd'
              ? Math.min(100, (row.value / row.max) * 100)
              : Math.min(100, (Number(row.value) / row.max) * 100);
          const label = row.format === 'usd' ? formatUsd(Number(row.value)) : String(row.value);

          return (
            <div className="market-volume-panel__row" key={row.label}>
              <div className="market-volume-panel__meta">
                <span>{row.label}</span>
                <strong>{label}</strong>
              </div>
              <div className="market-volume-panel__track" aria-hidden="true">
                <span className="market-volume-panel__fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
