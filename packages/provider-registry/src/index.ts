import type {
  Erc8004Identity,
  OutputType,
  PrivacyFeatureKey,
  ProviderDiscoveryQuery,
  ProviderPrivacy,
  ProviderProfile,
  ProviderVerificationStatus,
  PrivacyRoutingMode,
  RaidTaskSpec,
} from '@bossraid/shared-types';
import { DEFAULTS } from '@bossraid/constants';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeModelFamily(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeFilterValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function computePrivacyScore(privacy: ProviderPrivacy | undefined): number {
  if (!privacy) {
    return 0;
  }

  const explicit = typeof privacy.score === 'number' ? privacy.score : undefined;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.max(0, Math.min(100, explicit));
  }

  let score = 0;
  if (privacy.teeAttested) score += 35;
  if (privacy.e2ee) score += 25;
  if (privacy.noDataRetention) score += 20;
  if (privacy.signedOutputs) score += 10;
  if (privacy.provenanceAttested) score += 5;
  if (privacy.operatorVerified) score += 5;
  return Math.max(0, Math.min(100, score));
}

export function computeReputationScore(provider: ProviderProfile): number {
  const completionRate = provider.reputation.globalScore;
  const evaluatorPassRate = provider.reputation.validityScore;
  const responseRate = provider.reputation.responsivenessScore;
  const timeoutPenalty = provider.reputation.timeoutRate * 20;
  const duplicatePenalty = provider.reputation.duplicateRate * 15;
  const latencyComponent =
    provider.reputation.p95LatencyMs <= 3_000
      ? 10
      : provider.reputation.p95LatencyMs <= 7_000
        ? 7
        : provider.reputation.p95LatencyMs <= DEFAULTS.PROVIDER_FRESH_MS / 4
          ? 4
          : 1;

  const total = Math.round(
    30 * completionRate +
      30 * evaluatorPassRate +
      20 * responseRate +
      latencyComponent +
      10 -
      timeoutPenalty -
      duplicatePenalty
  );

  return Math.max(0, Math.min(100, total));
}

export function providerHasErc8004Identity(provider: ProviderProfile): boolean {
  return erc8004IdentityIsRegistered(provider.erc8004);
}

export function providerIsVeniceBacked(provider: ProviderProfile): boolean {
  return normalizeModelFamily(provider.modelFamily).includes('venice');
}

export function erc8004IdentityIsRegistered(identity: Erc8004Identity | undefined): boolean {
  if (identity?.verification?.status === 'failed') {
    return false;
  }
  return Boolean(identity?.agentId && identity.registrationTx);
}

export function computeTrustScore(provider: ProviderProfile): number {
  if (provider.erc8004?.verification?.status === 'failed') {
    return 0;
  }

  if (typeof provider.trust?.score === 'number' && Number.isFinite(provider.trust.score)) {
    return Math.max(0, Math.min(100, provider.trust.score));
  }

  const identity = provider.erc8004;
  if (!erc8004IdentityIsRegistered(identity)) {
    return 0;
  }

  let score = 45;
  if (identity?.operatorWallet) score += 15;
  if (identity?.identityRegistry) score += 15;
  if (identity?.reputationRegistry) score += 10;
  if (identity?.validationRegistry) score += 10;
  if ((identity?.validationTxs?.length ?? 0) > 0) score += 5;
  return Math.max(0, Math.min(100, score));
}

export function refreshProviderScores(provider: ProviderProfile): ProviderProfile {
  provider.scores = {
    privacyScore: computePrivacyScore(provider.privacy),
    reputationScore: computeReputationScore(provider),
  };
  return provider;
}

export function providerHasPrivacyFeature(
  provider: ProviderProfile,
  feature: PrivacyFeatureKey
): boolean {
  const privacy = provider.privacy;
  if (!privacy) {
    return false;
  }

  switch (feature) {
    case 'tee_attested':
      return privacy.teeAttested === true;
    case 'e2ee':
      return privacy.e2ee === true;
    case 'no_data_retention':
      return privacy.noDataRetention === true;
    case 'signed_outputs':
      return privacy.signedOutputs === true;
    case 'provenance_attested':
      return privacy.provenanceAttested === true;
    case 'operator_verified':
      return privacy.operatorVerified === true;
  }
}

export function listProviderPrivacyFeatures(provider: ProviderProfile): PrivacyFeatureKey[] {
  const features: PrivacyFeatureKey[] = [];
  if (providerHasPrivacyFeature(provider, 'tee_attested')) features.push('tee_attested');
  if (providerHasPrivacyFeature(provider, 'e2ee')) features.push('e2ee');
  if (providerHasPrivacyFeature(provider, 'no_data_retention')) {
    features.push('no_data_retention');
  }
  if (providerHasPrivacyFeature(provider, 'signed_outputs')) features.push('signed_outputs');
  if (providerHasPrivacyFeature(provider, 'provenance_attested')) {
    features.push('provenance_attested');
  }
  if (providerHasPrivacyFeature(provider, 'operator_verified')) {
    features.push('operator_verified');
  }
  return features;
}

export function providerHeartbeatAgeMs(
  provider: ProviderProfile,
  nowMs: number = Date.now()
): number | undefined {
  if (!provider.lastSeenAt) {
    return undefined;
  }

  const lastSeenMs = Date.parse(provider.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return undefined;
  }

  return Math.max(0, nowMs - lastSeenMs);
}

export function providerIsFresh(
  provider: ProviderProfile,
  maxHeartbeatAgeMs: number = DEFAULTS.PROVIDER_FRESH_MS,
  nowMs: number = Date.now()
): boolean {
  if (provider.status !== 'available') {
    return false;
  }

  const ageMs = providerHeartbeatAgeMs(provider, nowMs);
  if (ageMs == null) {
    return true;
  }

  return ageMs <= maxHeartbeatAgeMs;
}

export type ProviderMarketplaceConstraints = {
  capabilities?: string[];
  sourceType?: string;
  supportedFramework?: string;
  allowedModelFamilies?: string[];
  allowedAgentFrameworks?: string[];
  allowedModelProviders?: string[];
  allowedModelIds?: string[];
  allowedOutputTypes?: OutputType[];
  requireErc8004?: boolean;
  requiredVerificationStatus?: ProviderVerificationStatus;
  minTrustScore?: number;
  minReputationScore?: number;
  privacyMode?: PrivacyRoutingMode;
  requirePrivacyFeatures?: PrivacyFeatureKey[];
  onlineOnly?: boolean;
  maxHeartbeatAgeMs?: number;
};

export function providerMatchesAllowedModelFamilies(
  provider: ProviderProfile,
  allowedFamilies: string[] | undefined
): boolean {
  if (!allowedFamilies?.length) {
    return true;
  }

  if (!provider.modelFamily) {
    return false;
  }

  return allowedFamilies.some(
    (family) => normalizeModelFamily(family) === normalizeModelFamily(provider.modelFamily)
  );
}

export function providerMatchesAllowedAgentFrameworks(
  provider: ProviderProfile,
  allowedFrameworks: ProviderMarketplaceConstraints['allowedAgentFrameworks']
): boolean {
  if (!allowedFrameworks?.length) {
    return true;
  }

  return Boolean(
    provider.agentFramework &&
    allowedFrameworks.some((framework) => framework === provider.agentFramework)
  );
}

export function providerMatchesAllowedModelProviders(
  provider: ProviderProfile,
  allowedProviders: string[] | undefined
): boolean {
  if (!allowedProviders?.length) {
    return true;
  }

  if (!provider.modelProvider) {
    return false;
  }

  return allowedProviders.some(
    (modelProvider) =>
      normalizeFilterValue(modelProvider) === normalizeFilterValue(provider.modelProvider)
  );
}

export function providerMatchesAllowedModelIds(
  provider: ProviderProfile,
  allowedModelIds: string[] | undefined
): boolean {
  if (!allowedModelIds?.length) {
    return true;
  }

  if (!provider.modelId) {
    return false;
  }

  return allowedModelIds.some(
    (modelId) => normalizeFilterValue(modelId) === normalizeFilterValue(provider.modelId)
  );
}

export function providerMatchesMarketplaceConstraints(
  provider: ProviderProfile,
  constraints: ProviderMarketplaceConstraints = {},
  options: {
    defaultMaxHeartbeatAgeMs?: number;
    skipFreshnessCheck?: boolean;
  } = {}
): boolean {
  const defaultMaxHeartbeatAgeMs = options.defaultMaxHeartbeatAgeMs ?? DEFAULTS.PROVIDER_FRESH_MS;
  const onlineOnly = constraints.onlineOnly ?? true;
  const maxHeartbeatAgeMs = constraints.maxHeartbeatAgeMs ?? defaultMaxHeartbeatAgeMs;

  if (onlineOnly && !options.skipFreshnessCheck && !providerIsFresh(provider, maxHeartbeatAgeMs)) {
    return false;
  }

  if ((provider.marketplaceOfferStatus ?? 'active') === 'paused') {
    return false;
  }

  if (
    provider.routingCooldownUntil &&
    Number.isFinite(Date.parse(provider.routingCooldownUntil)) &&
    Date.parse(provider.routingCooldownUntil) > Date.now()
  ) {
    return false;
  }

  if (
    constraints.capabilities?.length &&
    !constraints.capabilities.every((capability) => provider.specializations.includes(capability))
  ) {
    return false;
  }

  if (constraints.sourceType) {
    const normalized = constraints.sourceType.replace(/-/g, '_').toLowerCase();
    const providerSource = provider.source?.type?.replace(/-/g, '_').toLowerCase();
    if (providerSource !== normalized) {
      return false;
    }
  }

  if (constraints.supportedFramework) {
    const frameworks = provider.supportedFrameworks ?? [];
    if (!frameworks.includes(constraints.supportedFramework)) {
      return false;
    }
  }

  if (
    constraints.allowedModelFamilies?.length &&
    !providerMatchesAllowedModelFamilies(provider, constraints.allowedModelFamilies)
  ) {
    return false;
  }

  if (
    constraints.allowedAgentFrameworks?.length &&
    !providerMatchesAllowedAgentFrameworks(provider, constraints.allowedAgentFrameworks)
  ) {
    return false;
  }

  if (
    constraints.allowedModelProviders?.length &&
    !providerMatchesAllowedModelProviders(provider, constraints.allowedModelProviders)
  ) {
    return false;
  }

  if (
    constraints.allowedModelIds?.length &&
    !providerMatchesAllowedModelIds(provider, constraints.allowedModelIds)
  ) {
    return false;
  }

  if (
    constraints.allowedOutputTypes?.length &&
    !constraints.allowedOutputTypes.some((type) => provider.outputTypes?.includes(type))
  ) {
    return false;
  }

  if (constraints.requireErc8004 === true && !providerHasErc8004Identity(provider)) {
    return false;
  }

  if (
    constraints.requiredVerificationStatus &&
    provider.verification?.status !== constraints.requiredVerificationStatus
  ) {
    return false;
  }

  const trustScore = computeTrustScore(provider);
  if (typeof constraints.minTrustScore === 'number' && trustScore < constraints.minTrustScore) {
    return false;
  }

  const reputationScore = provider.scores?.reputationScore ?? computeReputationScore(provider);
  if (
    typeof constraints.minReputationScore === 'number' &&
    reputationScore < constraints.minReputationScore
  ) {
    return false;
  }

  if (constraints.privacyMode === 'strict' && constraints.requirePrivacyFeatures?.length) {
    return constraints.requirePrivacyFeatures.every((feature) =>
      providerHasPrivacyFeature(provider, feature)
    );
  }

  return true;
}

export function providerMatchesDiscoveryQuery(
  provider: ProviderProfile,
  query: ProviderDiscoveryQuery = {},
  defaultMaxHeartbeatAgeMs: number = DEFAULTS.PROVIDER_FRESH_MS
): boolean {
  return providerMatchesMarketplaceConstraints(
    provider,
    {
      capabilities: query.capabilities,
      sourceType: query.sourceType,
      supportedFramework: query.supportedFramework,
      allowedModelFamilies: query.allowedModelFamilies,
      allowedAgentFrameworks: query.allowedAgentFrameworks,
      allowedModelProviders: query.allowedModelProviders,
      allowedModelIds: query.allowedModelIds,
      allowedOutputTypes: query.allowedOutputTypes,
      requireErc8004: query.requireErc8004,
      requiredVerificationStatus: query.requiredVerificationStatus,
      minTrustScore: query.minTrustScore,
      minReputationScore: query.minReputationScore,
      privacyMode: query.privacyMode,
      requirePrivacyFeatures: query.requirePrivacyFeatures,
      onlineOnly: query.onlineOnly,
      maxHeartbeatAgeMs: query.maxHeartbeatAgeMs ?? defaultMaxHeartbeatAgeMs,
    },
    { defaultMaxHeartbeatAgeMs }
  );
}

export function buildDiscoveryQueryFromTask(task: RaidTaskSpec): ProviderDiscoveryQuery {
  return {
    capabilities: task.constraints.requireSpecializations,
    allowedModelFamilies: task.constraints.allowedModelFamilies,
    allowedAgentFrameworks: task.constraints.allowedAgentFrameworks,
    allowedModelProviders: task.constraints.allowedModelProviders,
    allowedModelIds: task.constraints.allowedModelIds,
    allowedOutputTypes: task.constraints.allowedOutputTypes,
    privacyMode: task.constraints.privacyMode,
    requirePrivacyFeatures: task.constraints.requirePrivacyFeatures,
    requireErc8004: task.constraints.requireErc8004,
    minTrustScore: task.constraints.minTrustScore,
    requiredVerificationStatus: task.constraints.requiredVerificationStatus,
    minReputationScore: clamp01(task.constraints.minReputation) * 100,
  };
}
