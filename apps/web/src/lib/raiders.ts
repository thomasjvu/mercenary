import type { Provider, ProviderHealth } from '../api';

export type Erc8004VerificationStatus = NonNullable<
  NonNullable<Provider['erc8004']>['verification']
>['status'];
export type SortKey = 'reputation' | 'wins' | 'privacy' | 'trust' | 'price';
export type StatusFilter = 'all' | 'ready' | 'available' | 'offline';

export type RaiderRecord = {
  provider: Provider;
  ready: boolean;
  isOnline: boolean;
  onlineLabel: 'online' | 'offline';
  activityLabel: string;
  activityTone: 'ready' | 'available' | 'offline';
  reputationScore: number;
  privacyScore: number;
  trustScore: number;
  successfulRaids: number;
  privacySignals: string[];
  specializations: string[];
  modelLabel: string;
  lastSeenLabel: string;
  searchIndex: string;
};

export const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'reputation', label: 'reputation' },
  { key: 'wins', label: 'wins' },
  { key: 'privacy', label: 'privacy' },
  { key: 'trust', label: 'trust' },
  { key: 'price', label: 'price' },
];

export const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'all' },
  { key: 'ready', label: 'ready' },
  { key: 'available', label: 'available' },
  { key: 'offline', label: 'offline' },
];

export const DEFAULT_AVATAR_POSITIONS = [
  '14% 20%',
  '50% 22%',
  '84% 24%',
  '24% 76%',
  '72% 74%',
] as const;

export function buildRaiderRecord(
  provider: Provider,
  health: ProviderHealth | undefined
): RaiderRecord {
  const privacySignals = [
    provider.privacy?.teeAttested ? 'tee' : null,
    provider.privacy?.e2ee ? 'e2ee' : null,
    provider.privacy?.noDataRetention ? 'no-retention' : null,
    provider.privacy?.signedOutputs ? 'signed' : null,
  ].filter((value): value is string => value != null);

  const ready = health?.ready === true;
  const reachable = health?.reachable === true;
  const activityTone: RaiderRecord['activityTone'] = ready
    ? 'ready'
    : reachable || provider.status === 'available'
      ? 'available'
      : 'offline';
  const isOnline = activityTone !== 'offline';

  return {
    provider,
    ready,
    isOnline,
    onlineLabel: isOnline ? 'online' : 'offline',
    activityLabel: ready ? 'ready' : reachable ? 'reachable' : provider.status,
    activityTone,
    reputationScore:
      provider.scores?.reputationScore ?? Math.round(provider.reputation.globalScore * 100),
    privacyScore: provider.scores?.privacyScore ?? provider.privacy?.score ?? 0,
    trustScore: provider.trust?.score ?? 0,
    successfulRaids: provider.reputation.totalSuccessfulRaids,
    privacySignals,
    specializations: provider.specializations,
    modelLabel:
      health?.model ??
      ([provider.modelProvider, provider.modelId].filter(Boolean).join('/') || undefined) ??
      provider.modelFamily ??
      'n/a',
    lastSeenLabel: formatAge(provider.lastSeenAt),
    searchIndex: [
      provider.displayName,
      provider.providerId,
      provider.agentId,
      provider.modelFamily,
      provider.agentFramework,
      provider.modelProvider,
      provider.modelId,
      provider.verification?.status,
      provider.verification?.notes?.join(' '),
      provider.description,
      provider.erc8004?.agentId,
      provider.erc8004?.operatorWallet,
      provider.erc8004?.verification?.status,
      provider.erc8004?.verification?.agentRegistry,
      provider.erc8004?.verification?.agentUri,
      provider.trust?.reason,
      provider.specializations.join(' '),
      provider.outputTypes?.join(' '),
      health?.model,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLowerCase(),
  };
}

export function compareRaiders(left: RaiderRecord, right: RaiderRecord, sortKey: SortKey): number {
  switch (sortKey) {
    case 'wins':
      return (
        right.successfulRaids - left.successfulRaids || right.reputationScore - left.reputationScore
      );
    case 'privacy':
      return right.privacyScore - left.privacyScore || right.reputationScore - left.reputationScore;
    case 'trust':
      return right.trustScore - left.trustScore || right.reputationScore - left.reputationScore;
    case 'price':
      return (
        left.provider.pricePerTaskUsd - right.provider.pricePerTaskUsd ||
        right.reputationScore - left.reputationScore
      );
    case 'reputation':
    default:
      return (
        right.reputationScore - left.reputationScore || right.successfulRaids - left.successfulRaids
      );
  }
}

export function readErc8004VerificationStatus(
  provider: Provider
): Erc8004VerificationStatus | undefined {
  return provider.erc8004?.verification?.status;
}

export function buildErc8004StatusValue(
  verificationStatus: Erc8004VerificationStatus | undefined,
  registered: boolean
): string {
  switch (verificationStatus) {
    case 'verified':
      return 'verified';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'failed';
    case 'error':
      return 'error';
    default:
      return registered ? 'registered' : 'pending';
  }
}

export function selectAvatarPosition(providerId: string, rank: number): string {
  let hash = rank;

  for (const char of providerId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }

  return DEFAULT_AVATAR_POSITIONS[hash % DEFAULT_AVATAR_POSITIONS.length];
}

export function isVeniceProvider(provider: Provider): boolean {
  return (provider.modelFamily ?? '').toLowerCase().includes('venice');
}

export function formatPrivacySignalLabel(signal: string) {
  switch (signal) {
    case 'tee':
      return 'TEE';
    case 'e2ee':
      return 'E2EE';
    case 'no-retention':
      return 'no retention';
    case 'signed':
      return 'signed';
    default:
      return signal;
  }
}

export function summarizeRaiderPriceBounds(raiders: RaiderRecord[]): { min: number; max: number } {
  const prices = raiders
    .map((raider) => raider.provider.pricePerTaskUsd)
    .filter((price) => Number.isFinite(price) && price >= 0);

  if (prices.length === 0) {
    return { min: 0, max: 5 };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return {
    min,
    max: max > min ? max : min + 0.5,
  };
}

export function summarizeRaiderDirectory(raiders: RaiderRecord[]) {
  return {
    readyCount: raiders.filter((raider) => raider.ready).length,
    privacyCount: raiders.filter(
      (raider) => raider.privacyScore >= 60 || raider.privacySignals.length >= 2
    ).length,
    verifiedCount: raiders.filter(
      (raider) => readErc8004VerificationStatus(raider.provider) === 'verified'
    ).length,
    totalCount: raiders.length,
  };
}

export function pickDisplayPrivacySignals(signals: string[]) {
  const priority = ['tee', 'signed', 'e2ee', 'no-retention'];
  const selected: string[] = [];

  for (const signal of priority) {
    if (signals.includes(signal)) {
      selected.push(signal);
    }
    if (selected.length === 2) {
      break;
    }
  }

  return selected;
}

function formatAge(value: string | undefined): string {
  if (!value) {
    return 'pending';
  }

  const ageMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 'pending';
  }

  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMinutes < 1) {
    return 'now';
  }
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `${ageHours}h`;
  }

  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays}d`;
}
