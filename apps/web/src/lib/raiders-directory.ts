import {
  compareRaiders,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type RaiderRecord,
  type SortKey,
  type StatusFilter,
} from './raiders.js';

export type FrameworkFilter =
  | 'all'
  | 'claude_code'
  | 'grok'
  | 'codex'
  | 'glm'
  | 'chutes'
  | 'custom';
export type InstallationFilter = 'all' | 'fresh' | 'skill_augmented';
export type CredentialClassFilter = 'all' | 'api_key' | 'plan_or_cli' | 'unknown';

export type RaidersDirectoryState = {
  query: string;
  sortKey: SortKey;
  statusFilter: StatusFilter;
  maxPriceUsd: number | null;
  frameworkFilter: FrameworkFilter;
  installationFilter: InstallationFilter;
  credentialClassFilter: CredentialClassFilter;
};

export const RAIDERS_DIRECTORY_DEFAULTS: RaidersDirectoryState = {
  query: '',
  sortKey: 'reputation',
  statusFilter: 'all',
  maxPriceUsd: null,
  frameworkFilter: 'all',
  installationFilter: 'all',
  credentialClassFilter: 'all',
};

export const FRAMEWORK_FILTER_OPTIONS: Array<{ key: FrameworkFilter; label: string }> = [
  { key: 'all', label: 'all frameworks' },
  { key: 'claude_code', label: 'Claude Code' },
  { key: 'grok', label: 'Grok Build' },
  { key: 'codex', label: 'Codex' },
  { key: 'glm', label: 'GLM' },
  { key: 'chutes', label: 'Chutes' },
  { key: 'custom', label: 'custom' },
];

export const INSTALLATION_FILTER_OPTIONS: Array<{ key: InstallationFilter; label: string }> = [
  { key: 'all', label: 'any install' },
  { key: 'fresh', label: 'vanilla / fresh' },
  { key: 'skill_augmented', label: 'skills' },
];

export const CREDENTIAL_CLASS_FILTER_OPTIONS: Array<{
  key: CredentialClassFilter;
  label: string;
}> = [
  { key: 'all', label: 'any purchase type' },
  { key: 'api_key', label: 'API key' },
  { key: 'plan_or_cli', label: 'plan / CLI' },
  { key: 'unknown', label: 'undisclosed' },
];

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

export function matchesRaiderFrameworkFilter(
  raider: RaiderRecord,
  frameworkFilter: FrameworkFilter
): boolean {
  if (frameworkFilter === 'all') {
    return true;
  }
  const framework =
    raider.provider.harnessProfile?.framework ?? raider.provider.agentFramework ?? 'custom';
  return String(framework) === frameworkFilter;
}

export function matchesRaiderInstallationFilter(
  raider: RaiderRecord,
  installationFilter: InstallationFilter
): boolean {
  if (installationFilter === 'all') {
    return true;
  }
  const installation = raider.provider.harnessProfile?.installation ?? 'fresh';
  return installation === installationFilter;
}

export function matchesRaiderCredentialClassFilter(
  raider: RaiderRecord,
  credentialClassFilter: CredentialClassFilter
): boolean {
  if (credentialClassFilter === 'all') {
    return true;
  }
  const credentialClass = raider.provider.harnessProfile?.credentialClass ?? 'unknown';
  return credentialClass === credentialClassFilter;
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
        matchesRaiderPriceCeiling(raider, state.maxPriceUsd) &&
        matchesRaiderFrameworkFilter(raider, state.frameworkFilter) &&
        matchesRaiderInstallationFilter(raider, state.installationFilter) &&
        matchesRaiderCredentialClassFilter(raider, state.credentialClassFilter)
    )
    .sort((left, right) => compareRaiders(left, right, sortKey));
}

export function hasActiveRaidersDirectory(state: RaidersDirectoryState): boolean {
  return (
    state.query.trim() !== '' ||
    state.statusFilter !== RAIDERS_DIRECTORY_DEFAULTS.statusFilter ||
    state.sortKey !== RAIDERS_DIRECTORY_DEFAULTS.sortKey ||
    state.maxPriceUsd != null ||
    state.frameworkFilter !== RAIDERS_DIRECTORY_DEFAULTS.frameworkFilter ||
    state.installationFilter !== RAIDERS_DIRECTORY_DEFAULTS.installationFilter ||
    state.credentialClassFilter !== RAIDERS_DIRECTORY_DEFAULTS.credentialClassFilter
  );
}
