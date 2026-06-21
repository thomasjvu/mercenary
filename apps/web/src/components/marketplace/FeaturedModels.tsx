import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { formatUsd } from '@bossraid/proof-ui';
import type { InferenceMarket } from '../../api/marketplace.js';
import { FEATURED_MARKET_MODELS } from '../../lib/featured-models.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import {
  computeSavingsPercent,
  resolveMarketBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';
import {
  formatPer1mTokenPrice,
  resolveMarketBaseInputPer1mUsd,
  resolveMarketBaseOutputPer1mUsd,
} from '../../lib/marketplace-pricing.js';
import { resolveTeeTrustLevel } from '../../lib/tee-trust-badge.js';
import { TeeTrustBadge } from '../trust/TeeTrustBadge.js';

type FeaturedModelsProps = {
  markets: InferenceMarket[];
  onOpenModel: (modelId: string) => void;
};

const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export function FeaturedModels({ markets, onOpenModel }: FeaturedModelsProps) {
  const marketById = new Map(markets.map((market) => [market.modelId, market]));

  return (
    <section aria-label="Featured models" className="featured-models">
      <div className="featured-models__head">
        <h2 className="section-title">Featured models</h2>
      </div>
      <div className="featured-models__grid featured-models__grid--spotlight">
        {FEATURED_MARKET_MODELS.map((featured) => {
          const market = marketById.get(featured.modelId);
          const catalog = catalogById.get(featured.modelId);
          const benchmark = market ? resolveMarketBenchmarkTaskUsd(market) : null;
          const savingsPercent =
            market && benchmark != null && market.cheapestRateUsd != null
              ? computeSavingsPercent(benchmark, market.cheapestRateUsd)
              : null;
          const teeSellerCount =
            market?.sellers.filter((seller) => seller.privacy.teeAttested).length ?? 0;
          const baseInputPer1mUsd =
            market != null
              ? resolveMarketBaseInputPer1mUsd(market)
              : (catalog?.inputPer1mUsd ?? null);
          const baseOutputPer1mUsd =
            market != null
              ? resolveMarketBaseOutputPer1mUsd(market)
              : (catalog?.outputPer1mUsd ?? null);

          return (
            <button
              className="featured-models__card"
              key={featured.modelId}
              onClick={() => onOpenModel(featured.modelId)}
              type="button"
            >
              <span className="featured-models__identity">
                <ProviderBrandIcon
                  modelProvider={market?.modelProvider ?? catalog?.modelProvider}
                />
                <span className="featured-models__copy">
                  <strong>{featured.label}</strong>
                  <span>{featured.modelId}</span>
                </span>
              </span>

              <span className="featured-models__meta">
                <span>
                  base {formatPer1mTokenPrice(baseInputPer1mUsd)} /{' '}
                  {formatPer1mTokenPrice(baseOutputPer1mUsd)} per 1M
                </span>
                <span>
                  {market?.cheapestRateUsd != null
                    ? `from ${formatUsd(market.cheapestRateUsd)}`
                    : 'catalog reference'}
                  {market && market.activeProviderCount > 0
                    ? ` · ${market.activeProviderCount} live`
                    : ' · no live sellers'}
                </span>
              </span>

              {savingsPercent != null && savingsPercent > 0 ? (
                <span className="featured-models__savings">
                  {Math.round(savingsPercent)}% below reference
                </span>
              ) : null}

              <span className="featured-models__tags">
                <TeeTrustBadge
                  count={teeSellerCount > 0 ? teeSellerCount : undefined}
                  level={resolveTeeTrustLevel({
                    catalogTeeAttested: Boolean(catalog?.teeAttested || teeSellerCount > 0),
                  })}
                />
                {catalog?.e2ee ? <span className="trust-badge trust-badge--e2ee">e2ee</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
