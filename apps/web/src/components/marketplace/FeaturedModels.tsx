import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { formatUsd } from '@bossraid/proof-ui';
import type { InferenceMarket } from '../../api/marketplace.js';
import { FEATURED_MARKET_MODELS } from '../../lib/featured-models.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import { SegmentBar } from '../system/SegmentBar.js';
import {
  computeSavingsPercent,
  resolveMarketBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';

type FeaturedModelsProps = {
  markets: InferenceMarket[];
  onOpenModel: (modelId: string) => void;
  onSelectModel: (modelId: string) => void;
  activeModelId?: string;
};

const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export function FeaturedModels({
  markets,
  onOpenModel,
  onSelectModel,
  activeModelId,
}: FeaturedModelsProps) {
  const marketById = new Map(markets.map((market) => [market.modelId, market]));

  return (
    <section aria-label="Featured models" className="featured-models">
      <div className="featured-models__head">
        <h2 className="section-title">Featured models</h2>
      </div>
      <div className="featured-models__grid">
        {FEATURED_MARKET_MODELS.map((featured) => {
          const market = marketById.get(featured.modelId);
          const catalog = catalogById.get(featured.modelId);
          const benchmark = market ? resolveMarketBenchmarkTaskUsd(market) : null;
          const savingsPercent =
            market && benchmark != null && market.cheapestRateUsd != null
              ? (computeSavingsPercent(benchmark, market.cheapestRateUsd) ?? 0)
              : 0;
          const teeSellerCount =
            market?.sellers.filter((seller) => seller.privacy.teeAttested).length ?? 0;

          return (
            <article
              className={`featured-models__card${activeModelId === featured.modelId ? ' featured-models__card--active' : ''}`}
              key={featured.modelId}
            >
              <button
                className="featured-models__select"
                onClick={() => onSelectModel(featured.modelId)}
                type="button"
              >
                <ProviderBrandIcon
                  modelProvider={market?.modelProvider ?? catalog?.modelProvider}
                />
                <span className="featured-models__copy">
                  <strong>{featured.label}</strong>
                  <span>{featured.modelId}</span>
                </span>
              </button>

              <div className="featured-models__meta">
                <span>
                  {market?.cheapestRateUsd != null
                    ? `from ${formatUsd(market.cheapestRateUsd)}`
                    : 'catalog reference'}
                </span>
                <span>
                  {market && market.activeProviderCount > 0
                    ? `${market.activeProviderCount} live`
                    : 'no live sellers'}
                </span>
              </div>

              {savingsPercent > 0 ? (
                <SegmentBar segments={18} tone="savings" value={Math.min(100, savingsPercent)} />
              ) : (
                <SegmentBar segments={18} tone="market" value={28} />
              )}

              <div className="featured-models__tags">
                {catalog?.teeAttested || teeSellerCount > 0 ? (
                  <span className="trust-badge trust-badge--tee">tee</span>
                ) : null}
                {catalog?.e2ee ? <span className="trust-badge trust-badge--e2ee">e2ee</span> : null}
              </div>

              <button
                className="button button--ghost featured-models__open"
                onClick={() => onOpenModel(featured.modelId)}
                type="button"
              >
                open
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
