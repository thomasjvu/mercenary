import type { InferenceMarket } from '../../api/marketplace.js';
import {
  computeSavingsPercent,
  estimateBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';

type MarketSavingsSummaryProps = {
  markets: InferenceMarket[];
  activeOffers?: number;
};

export function MarketSavingsSummary({ markets, activeOffers }: MarketSavingsSummaryProps) {
  const savingsRows = markets
    .map((market) => {
      const benchmark = estimateBenchmarkTaskUsd(market.modelId);
      const percent = computeSavingsPercent(benchmark, market.cheapestRateUsd);
      return percent != null && percent > 0 ? percent : null;
    })
    .filter((value): value is number => value != null);

  const bestDiscount = savingsRows.length > 0 ? Math.max(...savingsRows) : null;
  const avgDiscount =
    savingsRows.length > 0
      ? Math.round(savingsRows.reduce((sum, value) => sum + value, 0) / savingsRows.length)
      : null;

  return (
    <section aria-label="Marketplace savings summary" className="market-savings-summary">
      <Chip label="best off" value={bestDiscount != null ? `${bestDiscount}%` : '—'} />
      <Chip label="avg off" value={avgDiscount != null ? `${avgDiscount}%` : '—'} />
      <Chip label="discounted" value={String(savingsRows.length)} />
      <Chip label="offers" value={String(activeOffers ?? 0)} />
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="market-savings-summary__chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
