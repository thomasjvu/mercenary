import { useDeferredValue, useMemo, useState } from 'react';
import type { RaiderRecord } from './raiders.js';
import {
  filterAndSortRaiders,
  hasActiveRaidersDirectory,
  RAIDERS_DIRECTORY_DEFAULTS,
  type RaidersDirectoryState,
} from './raiders-directory.js';

export function useRaidersDirectory(raiders: RaiderRecord[]) {
  const [state, setState] = useState<RaidersDirectoryState>(RAIDERS_DIRECTORY_DEFAULTS);
  const deferredQuery = useDeferredValue(state.query.trim().toLowerCase());

  const filteredRaiders = useMemo(
    () => filterAndSortRaiders(raiders, state, deferredQuery),
    [deferredQuery, raiders, state]
  );

  const patchState = (patch: Partial<RaidersDirectoryState>) => {
    setState((current) => ({ ...current, ...patch }));
  };

  const reset = () => {
    setState(RAIDERS_DIRECTORY_DEFAULTS);
  };

  return {
    state,
    filteredRaiders,
    patchState,
    reset,
    isActive: hasActiveRaidersDirectory(state),
  };
}
