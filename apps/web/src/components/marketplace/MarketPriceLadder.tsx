import type { InferenceMarket } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';

const MAX_ROWS = 8;

type MarketPriceLadderProps = {
  markets: InferenceMarket[];
  title?: string;
  limit?: number;
};

export function MarketPriceLadder({
  markets,
  title = 'cheapest live rates',
  limit = MAX_ROWS,
}: MarketPriceLadderProps) {
  const rows = markets
    .filter((market) => market.cheapestRateUsd != null && market.cheapestRateUsd > 0)
    .sort(
      (left, right) =>
        (left.cheapestRateUsd ?? Number.POSITIVE_INFINITY) -
        (right.cheapestRateUsd ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, limit);

  if (rows.length === 0) {
    return (
      <section aria-label="Marketplace price ladder" className="market-price-ladder">
        <p className="eyebrow">{title}</p>
        <p className="market-price-ladder__empty">No live seller rates yet.</p>
      </section>
    );
  }

  const maxRate = Math.max(...rows.map((row) => row.cheapestRateUsd ?? 0));

  return (
    <section aria-label="Marketplace price ladder" className="market-price-ladder">
      <p className="eyebrow">{title}</p>
      <div className="market-price-ladder__rows">
        {rows.map((row) => {
          const rate = row.cheapestRateUsd ?? 0;
          const width = Math.max(8, (rate / maxRate) * 100);

          return (
            <div className="market-price-ladder__row" key={row.modelId}>
              <div className="market-price-ladder__meta">
                <ProviderBrandIcon modelProvider={row.modelProvider} />
                <div className="market-price-ladder__copy">
                  <strong>{row.modelId}</strong>
                  <span>
                    {row.activeProviderCount}/{row.providerCount} sellers
                  </span>
                </div>
                <strong className="market-price-ladder__rate">{formatUsd(rate)}</strong>
              </div>
              <div className="market-price-ladder__track" aria-hidden="true">
                <span className="market-price-ladder__fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
