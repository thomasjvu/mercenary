import { FilterChips } from '../system/FilterChips.js';
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
  isActive: boolean;
  onPatch: (patch: Partial<RaidersDirectoryState>) => void;
  onReset: () => void;
};

export function RaidersDirectoryToolbar({
  state,
  shownCount,
  totalCount,
  isActive,
  onPatch,
  onReset,
}: RaidersDirectoryToolbarProps) {
  return (
    <RefinePanel
      aria-label="Raiders search and filters"
      className="raiders-directory"
      countClassName="raiders-directory__count"
      countLabel={`${shownCount} of ${totalCount}`}
      headClassName="raiders-directory__head"
      isActive={isActive}
      onReset={onReset}
      resetClassName="raiders-directory__reset"
      titleClassName="raiders-directory__title"
    >
      <FilterSearch
        className="raiders-directory__search"
        label="Search"
        labelClassName="raiders-directory__label"
        onChange={(value) => onPatch({ query: value })}
        placeholder="Name, model, specialty…"
        value={state.query}
      />

      <div className="raiders-directory__controls">
        <FilterChips
          ariaLabel="Status filter"
          chipClassName="raiders-directory__chip"
          activeClassName="raiders-directory__chip--active"
          chipsClassName="raiders-directory__chips"
          groupClassName="raiders-directory__group"
          groupLabel="Status"
          groupLabelClassName="raiders-directory__label"
          onChange={(value) => onPatch({ statusFilter: value })}
          options={STATUS_OPTIONS.map((option) => ({
            value: option.key,
            label: option.label,
          }))}
          value={state.statusFilter}
        />
        <FilterSelect
          className="raiders-directory__sort"
          label="Sort"
          onChange={(value) => onPatch({ sortKey: value as RaidersDirectoryState['sortKey'] })}
          options={SORT_OPTIONS.map((option) => [option.key, option.label])}
          value={state.sortKey}
        />
      </div>
    </RefinePanel>
  );
}
