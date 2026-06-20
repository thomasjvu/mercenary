import { FeaturedModels } from '../components/marketplace/FeaturedModels.js';
import { MarketplaceCatalogPanel } from '../components/marketplace/MarketplaceCatalogPanel.js';
import { MarketplaceFiltersPanel } from '../components/marketplace/MarketplaceFiltersPanel.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { CurlQuickstart } from '../components/terminal/CurlQuickstart.js';
import { useMarketplacePage } from '../hooks/useMarketplacePage.js';

export function MarketplacePage({ onOpenModel }: { onOpenModel: (modelId: string) => void }) {
  const state = useMarketplacePage();
  const featuredMarkets = state.allMarkets.data?.data ?? state.trustFilteredMarkets;

  return (
    <section className="page-shell page-flat market-page">
      <MarketStatsRibbon isLoading={state.markets.isLoading} markets={state.markets.data} />

      <div className="market-page__spotlight">
        <div className="market-page__spotlight-main">
          <FeaturedModels markets={featuredMarkets} onOpenModel={onOpenModel} />
        </div>
        <aside className="market-page__spotlight-aside page-panel">
          <p className="eyebrow">API quickstart</p>
          <CurlQuickstart
            code={state.spotlightCurl}
            compact
            note=""
            runHref={`/playground?model=${encodeURIComponent(state.spotlightModel)}`}
            spacebarCta
            theme="raid"
          />
        </aside>
      </div>

      <div className="marketplace-layout market-page__layout">
        <MarketplaceFiltersPanel state={state} />
        <div className="market-page__main">
          <MarketplaceCatalogPanel onOpenModel={onOpenModel} state={state} />
        </div>
      </div>
    </section>
  );
}
