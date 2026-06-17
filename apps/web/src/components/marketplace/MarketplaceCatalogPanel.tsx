import { EmptyState } from '../system/EmptyState.js';
import { buildApiReadinessHint, readApiErrorMessage } from '../../lib/api-readiness.js';
import { ModelCatalog } from './ModelCatalog.js';
import type { MarketplacePageState } from '../../hooks/useMarketplacePage.js';

type MarketplaceCatalogPanelProps = {
  state: MarketplacePageState;
  onOpenModel: (modelId: string) => void;
};

export function MarketplaceCatalogPanel({ state, onOpenModel }: MarketplaceCatalogPanelProps) {
  const { markets, trustFilteredMarkets, filtersActive, totalMarketCount, resetFilters } = state;

  if (markets.error) {
    return (
      <EmptyState
        body={`${readApiErrorMessage(markets.error)} ${buildApiReadinessHint(markets.error)}`}
        title="Marketplace unavailable"
      />
    );
  }

  if (markets.isLoading) {
    return <EmptyState body="Reading seller order books." title="Loading markets" />;
  }

  if (trustFilteredMarkets.length === 0) {
    return (
      <EmptyState
        action={
          filtersActive && totalMarketCount > 0 ? (
            <button className="button" onClick={resetFilters} type="button">
              clear filters
            </button>
          ) : null
        }
        body={
          filtersActive && totalMarketCount > 0
            ? 'No seller matches this filter, but other models are available.'
            : 'No seller matches this filter.'
        }
        title="No eligible sellers"
      />
    );
  }

  return (
    <ModelCatalog
      markets={trustFilteredMarkets}
      onOpenModel={onOpenModel}
      sortKey={state.filters.sort}
    />
  );
}
