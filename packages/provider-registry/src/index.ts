import type {
  Erc8004Identity,
  PrivacyFeatureKey,
  ProviderDiscoveryQuery,
  ProviderPrivacy,
  ProviderProfile,
  RaidTaskSpec,
} from "@bossraid/shared-types";

export const DEFAULT_PROVIDER_FRESH_MS = 60_000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeModelFamily(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function computePrivacyScore(privacy: ProviderPrivacy | undefined): number {
  if (!privacy) {
    return 0;
  }

  const explicit = typeof privacy.score === "number" ? privacy.score : undefined;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
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
    provider.reputation.p95LatencyMs <= 3_000 ? 10 :
    provider.reputation.p95LatencyMs <= 7_000 ? 7 :
    provider.reputation.p95LatencyMs <= 15_000 ? 4 : 1;

  const total = Math.round(
    30 * completionRate +
    30 * evaluatorPassRate +
    20 * responseRate +
    latencyComponent +
    10 -
    timeoutPenalty -
    duplicatePenalty,
  );

  return Math.max(0, Math.min(100, total));
}

export function providerHasErc8004Identity(provider: ProviderProfile): boolean {
  return erc8004IdentityIsRegistered(provider.erc8004);
}

export function providerIsVeniceBacked(provider: ProviderProfile): boolean {
  return normalizeModelFamily(provider.modelFamily).includes("venice");
}

export function erc8004IdentityIsRegistered(identity: Erc8004Identity | undefined): boolean {
  if (identity?.verification?.status === "failed") {
    return false;
  }
  return Boolean(identity?.agentId && identity.registrationTx);
}

export function computeTrustScore(provider: ProviderProfile): number {
  if (provider.erc8004?.verification?.status === "failed") {
    return 0;
  }

  if (typeof provider.trust?.score === "number" && Number.isFinite(provider.trust.score)) {
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
  feature: PrivacyFeatureKey,
): boolean {
  const privacy = provider.privacy;
  if (!privacy) {
    return false;
  }

  switch (feature) {
    case "tee_attested":
      return privacy.teeAttested === true;
    case "e2ee":
      return privacy.e2ee === true;
    case "no_data_retention":
      return privacy.noDataRetention === true;
    case "signed_outputs":
      return privacy.signedOutputs === true;
    case "provenance_attested":
      return privacy.provenanceAttested === true;
    case "operator_verified":
      return privacy.operatorVerified === true;
  }
}

export function providerHeartbeatAgeMs(
  provider: ProviderProfile,
  nowMs: number = Date.now(),
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
  maxHeartbeatAgeMs: number = DEFAULT_PROVIDER_FRESH_MS,
  nowMs: number = Date.now(),
): boolean {
  if (provider.status !== "available") {
    return false;
  }

  const ageMs = providerHeartbeatAgeMs(provider, nowMs);
  if (ageMs == null) {
    return true;
  }

  return ageMs <= maxHeartbeatAgeMs;
}

export function providerMatchesDiscoveryQuery(
  provider: ProviderProfile,
  query: ProviderDiscoveryQuery = {},
  defaultMaxHeartbeatAgeMs: number = DEFAULT_PROVIDER_FRESH_MS,
): boolean {
  const onlineOnly = query.onlineOnly ?? true;
  const maxHeartbeatAgeMs = query.maxHeartbeatAgeMs ?? defaultMaxHeartbeatAgeMs;

  if (onlineOnly && !providerIsFresh(provider, maxHeartbeatAgeMs)) {
    return false;
  }

  if (query.capabilities?.length && !query.capabilities.every((capability) => provider.specializations.includes(capability))) {
    return false;
  }

  if (
    query.allowedModelFamilies?.length &&
    (!provider.modelFamily ||
      !query.allowedModelFamilies.some((family) => normalizeModelFamily(family) === normalizeModelFamily(provider.modelFamily)))
  ) {
    return false;
  }

  if (query.allowedOutputTypes?.length && !query.allowedOutputTypes.some((type) => provider.outputTypes?.includes(type))) {
    return false;
  }

  if (query.requireErc8004 === true && !providerHasErc8004Identity(provider)) {
    return false;
  }

  const trustScore = computeTrustScore(provider);
  if (typeof query.minTrustScore === "number" && trustScore < query.minTrustScore) {
    return false;
  }

  const reputationScore = provider.scores?.reputationScore ?? computeReputationScore(provider);
  if (typeof query.minReputationScore === "number" && reputationScore < query.minReputationScore) {
    return false;
  }

  if (query.privacyMode === "strict" && query.requirePrivacyFeatures?.length) {
    return query.requirePrivacyFeatures.every((feature) => providerHasPrivacyFeature(provider, feature));
  }

  return true;
}

export function buildDiscoveryQueryFromTask(task: RaidTaskSpec): ProviderDiscoveryQuery {
  return {
    capabilities: task.constraints.requireSpecializations,
    allowedModelFamilies: task.constraints.allowedModelFamilies,
    allowedOutputTypes: task.constraints.allowedOutputTypes,
    privacyMode: task.constraints.privacyMode,
    requirePrivacyFeatures: task.constraints.requirePrivacyFeatures,
    requireErc8004: task.constraints.requireErc8004,
    minTrustScore: task.constraints.minTrustScore,
    minReputationScore: clamp01(task.constraints.minReputation) * 100,
  };
}
