import type { InferenceMarket } from '../../api/marketplace.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  resolveMarketBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';
import { formatUsd } from '@bossraid/proof-ui';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import { SegmentBar } from '../system/SegmentBar.js';

const MAX_ROWS = 8;

type MarketDiscountChartProps = {
  markets: InferenceMarket[];
  title?: string;
  limit?: number;
};

type DiscountRow = {
  market: InferenceMarket;
  benchmark: number;
  cheapest: number;
  savingsPercent: number;
  savingsUsd: number;
};

export function MarketDiscountChart({
  markets,
  title = 'discount vs reference',
  limit = MAX_ROWS,
}: MarketDiscountChartProps) {
  const rows = buildDiscountRows(markets).slice(0, limit);

  if (rows.length === 0) {
    return (
      <section aria-label="Marketplace discount chart" className="market-discount-chart">
        <p className="eyebrow">{title}</p>
        <p className="market-discount-chart__empty">No benchmark reference for live models yet.</p>
      </section>
    );
  }

  const maxBenchmark = Math.max(...rows.map((row) => row.benchmark));

  return (
    <section aria-label="Marketplace discount chart" className="market-discount-chart">
      <div className="market-discount-chart__head">
        <p className="eyebrow">{title}</p>
        <span className="market-discount-chart__legend">
          <span className="market-discount-chart__legend-item market-discount-chart__legend-item--ref">
            reference
          </span>
          <span className="market-discount-chart__legend-item market-discount-chart__legend-item--market">
            market
          </span>
        </span>
      </div>
      <div className="market-discount-chart__rows">
        {rows.map((row) => (
          <DiscountRowView key={row.market.modelId} maxBenchmark={maxBenchmark} row={row} />
        ))}
      </div>
    </section>
  );
}

export function ModelDiscountBar({ market }: { market: InferenceMarket }) {
  const rows = buildDiscountRows([market]);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return (
    <section
      aria-label="Model discount comparison"
      className="market-discount-chart market-discount-chart--single"
    >
      <DiscountRowView maxBenchmark={row.benchmark} row={row} showProvider />
    </section>
  );
}

export function SellerPriceSpreadChart({ market }: { market: InferenceMarket }) {
  const rates = market.sellers
    .map((seller) => seller.rateUsd)
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  const maxRate = rates.length > 0 ? Math.max(...rates) : 1;

  if (rates.length === 0) {
    return null;
  }

  return (
    <section aria-label="Seller price spread" className="seller-spread-chart">
      <p className="eyebrow">seller spread</p>
      <div className="seller-spread-chart__rows">
        {market.sellers.map((seller) => {
          const width = Math.max(8, (seller.rateUsd / maxRate) * 100);
          return (
            <div className="seller-spread-chart__row" key={seller.sellerId}>
              <div className="seller-spread-chart__meta">
                <span>{seller.displayName}</span>
                <strong>{formatUsd(seller.rateUsd)}</strong>
              </div>
              <SegmentBar tone="savings" value={width} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiscountRowView({
  row,
  maxBenchmark,
  showProvider = true,
}: {
  row: DiscountRow;
  maxBenchmark: number;
  showProvider?: boolean;
}) {
  const refWidth = Math.max(12, (row.benchmark / maxBenchmark) * 100);
  const marketWidth = Math.max(8, (row.cheapest / maxBenchmark) * 100);

  return (
    <div className="market-discount-chart__row">
      <div className="market-discount-chart__meta">
        {showProvider ? <ProviderBrandIcon modelProvider={row.market.modelProvider} /> : null}
        <div className="market-discount-chart__copy">
          <strong>{row.market.modelId}</strong>
          <span>
            {row.savingsPercent > 0
              ? `${row.savingsPercent}% off · save ${formatUsd(row.savingsUsd)}`
              : 'at reference'}
          </span>
        </div>
        <strong className="market-discount-chart__rate">{formatUsd(row.cheapest)}</strong>
      </div>
      <div className="market-discount-chart__bars">
        <SegmentBar tone="ref" value={refWidth} />
        <SegmentBar tone="market" value={marketWidth} />
      </div>
    </div>
  );
}

function buildDiscountRows(markets: InferenceMarket[]): DiscountRow[] {
  return markets
    .map((market) => {
      const benchmark = resolveMarketBenchmarkTaskUsd(market);
      const cheapest = market.cheapestRateUsd;

      if (benchmark == null || cheapest == null || cheapest <= 0) {
        return null;
      }

      return {
        market,
        benchmark,
        cheapest,
        savingsPercent: computeSavingsPercent(benchmark, cheapest) ?? 0,
        savingsUsd: computeSavingsUsd(benchmark, cheapest) ?? 0,
      };
    })
    .filter((row): row is DiscountRow => row != null)
    .sort(
      (left, right) =>
        right.savingsPercent - left.savingsPercent ||
        left.cheapest - right.cheapest ||
        left.market.modelId.localeCompare(right.market.modelId)
    );
}
