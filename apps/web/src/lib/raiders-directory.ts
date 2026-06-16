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
};

export const RAIDERS_DIRECTORY_DEFAULTS: RaidersDirectoryState = {
  query: '',
  sortKey: 'reputation',
  statusFilter: 'all',
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

export function filterAndSortRaiders(
  raiders: RaiderRecord[],
  state: RaidersDirectoryState,
  normalizedQuery = state.query.trim().toLowerCase()
): RaiderRecord[] {
  return raiders
    .filter(
      (raider) =>
        matchesRaiderStatusFilter(raider, state.statusFilter) &&
        matchesRaiderQuery(raider, normalizedQuery)
    )
    .sort((left, right) => compareRaiders(left, right, state.sortKey));
}

export function hasActiveRaidersDirectory(state: RaidersDirectoryState): boolean {
  return (
    state.query.trim() !== '' ||
    state.statusFilter !== RAIDERS_DIRECTORY_DEFAULTS.statusFilter ||
    state.sortKey !== RAIDERS_DIRECTORY_DEFAULTS.sortKey
  );
}
