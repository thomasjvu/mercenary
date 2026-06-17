import { formatUsdc } from '@bossraid/proof-ui';
import { FilterChips } from '../system/FilterChips.js';
import { FilterPriceSlider } from '../system/FilterPriceSlider.js';
import { FilterSearch } from '../system/FilterSearch.js';
import { FilterSelect } from '../system/FilterSelect.js';
import { RefinePanel } from '../system/RefinePanel.js';
import {
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type RaidersDirectoryState,
} from '../../lib/raiders-directory.js';

type RaidersDirectoryToolbarProps = {
  state: RaidersDirectoryState;
  shownCount: number;
  totalCount: number;
  priceBounds: { min: number; max: number };
  isActive: boolean;
  onPatch: (patch: Partial<RaidersDirectoryState>) => void;
  onReset: () => void;
};

export function RaidersDirectoryToolbar({
  state,
  shownCount,
  totalCount,
  priceBounds,
  isActive,
  onPatch,
  onReset,
}: RaidersDirectoryToolbarProps) {
  const sliderValue = state.maxPriceUsd ?? priceBounds.max;
  const priceLabel =
    state.maxPriceUsd == null ? `up to ${formatUsdc(priceBounds.max)}` : formatUsdc(sliderValue);

  return (
    <RefinePanel
      aria-label="Raiders search and filters"
      countLabel={`${shownCount} of ${totalCount}`}
      isActive={isActive}
      onReset={onReset}
    >
      <FilterSearch
        label="Search raiders"
        onChange={(value) => onPatch({ query: value })}
        placeholder="Name, model, specialty…"
        value={state.query}
      />

      <FilterPriceSlider
        displayValue={priceLabel}
        label="max price"
        max={priceBounds.max}
        min={priceBounds.min}
        onChange={(value) => {
          const atCatalogMax = value >= priceBounds.max - 0.000_001;
          onPatch({
            maxPriceUsd: atCatalogMax ? null : value,
            ...(atCatalogMax ? {} : { sortKey: 'price' }),
          });
        }}
        value={sliderValue}
      />

      <FilterSelect
        compact
        disabled={state.maxPriceUsd != null}
        label="sort"
        onChange={(value) => onPatch({ sortKey: value as RaidersDirectoryState['sortKey'] })}
        options={SORT_OPTIONS.map((option) => [option.key, option.label])}
        value={state.maxPriceUsd != null ? 'price' : state.sortKey}
      />

      <FilterChips
        ariaLabel="Status filter"
        groupLabel="Status"
        onChange={(value) => onPatch({ statusFilter: value })}
        options={STATUS_OPTIONS.map((option) => ({
          value: option.key,
          label: option.label,
        }))}
        value={state.statusFilter}
      />
    </RefinePanel>
  );
}
