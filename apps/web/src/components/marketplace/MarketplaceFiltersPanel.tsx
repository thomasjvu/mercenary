import { FilterChips } from '../system/FilterChips.js';
import { FilterField } from '../system/FilterField.js';
import { FilterSearch } from '../system/FilterSearch.js';
import { FilterSelect } from '../system/FilterSelect.js';
import { RefinePanel } from '../system/RefinePanel.js';
import {
  MARKETPLACE_FRAMEWORK_OPTIONS,
  MARKETPLACE_PRIVACY_OPTIONS,
  MARKETPLACE_SORT_OPTIONS,
  MARKETPLACE_TRUST_OPTIONS,
  MARKETPLACE_VERIFICATION_OPTIONS,
  type MarketplaceSortKey,
} from '../../lib/marketplace-filters.js';
import type { MarketplacePageState } from '../../hooks/useMarketplacePage.js';

type MarketplaceFiltersPanelProps = {
  state: MarketplacePageState;
};

export function MarketplaceFiltersPanel({ state }: MarketplaceFiltersPanelProps) {
  const { filters, patchFilters, filtersActive, resetFilters } = state;

  return (
    <RefinePanel aria-label="Marketplace filters" isActive={filtersActive} onReset={resetFilters}>
      <FilterSearch
        label="Search models"
        onChange={(value) => patchFilters({ model: value })}
        placeholder="gpt-5.5, claude, venice…"
        value={filters.model}
      />

      <FilterSelect
        compact
        label="sort"
        onChange={(value) => patchFilters({ sort: value as MarketplaceSortKey })}
        options={[...MARKETPLACE_SORT_OPTIONS]}
        value={filters.sort}
      />

      <FilterChips
        ariaLabel="Trust filter"
        groupLabel="Trust"
        onChange={(value) => patchFilters({ trust: value })}
        options={[...MARKETPLACE_TRUST_OPTIONS]}
        value={filters.trust}
      />

      <div className="market-filters__row">
        <FilterField
          compact
          label="provider"
          onChange={(value) => patchFilters({ provider: value })}
          placeholder="openai"
          value={filters.provider}
        />
        <FilterSelect
          compact
          label="framework"
          onChange={(value) => patchFilters({ framework: value })}
          options={[...MARKETPLACE_FRAMEWORK_OPTIONS]}
          value={filters.framework}
        />
      </div>

      <details className="market-filters__advanced">
        <summary>More filters</summary>
        <div className="market-filters__advanced-body">
          <FilterSelect
            compact
            label="privacy"
            onChange={(value) => patchFilters({ privacy: value })}
            options={[...MARKETPLACE_PRIVACY_OPTIONS]}
            value={filters.privacy}
          />
          <FilterSelect
            compact
            label="verify"
            onChange={(value) => patchFilters({ verification: value })}
            options={[...MARKETPLACE_VERIFICATION_OPTIONS]}
            value={filters.verification}
          />
          <FilterField
            compact
            inputMode="decimal"
            label="max budget"
            onChange={(value) => patchFilters({ budget: value })}
            placeholder="1.00"
            value={filters.budget}
          />
        </div>
      </details>
    </RefinePanel>
  );
}
