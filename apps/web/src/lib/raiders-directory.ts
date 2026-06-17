import {
  compareRaiders,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type RaiderRecord,
  type SortKey,
  type StatusFilter,
} from './raiders.js';

export type RaidersDirectoryState = {
  query: string;
  sortKey: SortKey;
  statusFilter: StatusFilter;
  maxPriceUsd: number | null;
};

export const RAIDERS_DIRECTORY_DEFAULTS: RaidersDirectoryState = {
  query: '',
  sortKey: 'reputation',
  statusFilter: 'all',
  maxPriceUsd: null,
};

export { SORT_OPTIONS, STATUS_OPTIONS };

export function matchesRaiderStatusFilter(
  raider: RaiderRecord,
  statusFilter: StatusFilter
): boolean {
  switch (statusFilter) {
    case 'ready':
      return raider.ready;
    case 'available':
      return raider.activityTone !== 'offline';
    case 'offline':
      return raider.activityTone === 'offline';
    case 'all':
    default:
      return true;
  }
}

export function matchesRaiderQuery(raider: RaiderRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  return raider.searchIndex.includes(query);
}

export function matchesRaiderPriceCeiling(
  raider: RaiderRecord,
  maxPriceUsd: number | null
): boolean {
  if (maxPriceUsd == null) {
    return true;
  }

  return raider.provider.pricePerTaskUsd <= maxPriceUsd;
}

export function filterAndSortRaiders(
  raiders: RaiderRecord[],
  state: RaidersDirectoryState,
  normalizedQuery = state.query.trim().toLowerCase()
): RaiderRecord[] {
  const sortKey = state.maxPriceUsd != null ? 'price' : state.sortKey;

  return raiders
    .filter(
      (raider) =>
        matchesRaiderStatusFilter(raider, state.statusFilter) &&
        matchesRaiderQuery(raider, normalizedQuery) &&
        matchesRaiderPriceCeiling(raider, state.maxPriceUsd)
    )
    .sort((left, right) => compareRaiders(left, right, sortKey));
}

export function hasActiveRaidersDirectory(state: RaidersDirectoryState): boolean {
  return (
    state.query.trim() !== '' ||
    state.statusFilter !== RAIDERS_DIRECTORY_DEFAULTS.statusFilter ||
    state.sortKey !== RAIDERS_DIRECTORY_DEFAULTS.sortKey ||
    state.maxPriceUsd != null
  );
}
