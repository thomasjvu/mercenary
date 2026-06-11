import {
  computeTrustScore,
  computePrivacyScore,
  computeReputationScore,
  providerHasErc8004Identity,
  providerHasPrivacyFeature,
  providerIsVeniceBacked,
  providerIsFresh,
} from '@bossraid/provider-registry';
import type {
  AssignmentRecord,
  PrivacyFeatureKey,
  ProviderProfile,
  RaidTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import { DEFAULT_TIMEOUTS } from './constants.js';
import {
  estimateProviderChargeUsd,
  estimateTaskInputTokens,
  estimateTaskOutputTokens,
  normalizePrice,
  readProviderPricing,
} from './pricing.js';
import { scoreTextDomainFit } from './text-domain.js';
import { normalizeLatency, scoreSpecialization } from './utils.js';

function providerContextWindowMatches(provider: ProviderProfile, task: RaidTaskSpec): boolean {
  const maxContextTokens = readProviderPricing(provider).maxContextTokens;
  if (typeof maxContextTokens !== 'number' || maxContextTokens <= 0) {
    return true;
  }
  const inputTokens = task.constraints.maxInputTokens ?? estimateTaskInputTokens(task);
  const outputTokens = estimateTaskOutputTokens(task);
  return inputTokens + outputTokens <= maxContextTokens;
}

export function computeSelectionScore(provider: ProviderProfile, task: RaidTaskSpec): number {
  const specializationMatch = scoreSpecialization(provider, task);
  const textDomainFit = scoreTextDomainFit(provider, task);
  const reputation = (provider.scores?.reputationScore ?? computeReputationScore(provider)) / 100;
  const latency = normalizeLatency(
    provider.reputation.p95LatencyMs,
    task.constraints.maxLatencySec
  );
  const validity = provider.reputation.validityScore;
  const price = normalizePrice(
    estimateProviderChargeUsd(provider, task),
    task.constraints.maxBudgetUsd,
    task.constraints.numExperts
  );

  if ((task.output?.primaryType ?? 'patch') === 'text') {
    return (
      0.2 * specializationMatch +
      0.3 * textDomainFit +
      0.2 * reputation +
      0.15 * latency +
      0.1 * validity +
      0.05 * price
    );
  }

  return (
    0.35 * specializationMatch + 0.2 * reputation + 0.2 * latency + 0.15 * validity + 0.1 * price
  );
}

function normalizeModelFamily(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeFilterValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function providerMatchesAllowedModelFamilies(
  provider: ProviderProfile,
  allowedFamilies: string[] | undefined
): boolean {
  if (!allowedFamilies?.length) {
    return true;
  }

  const providerFamily = normalizeModelFamily(provider.modelFamily);
  return (
    providerFamily.length > 0 &&
    allowedFamilies.some((family) => normalizeModelFamily(family) === providerFamily)
  );
}

export function providerMatchesAllowedAgentFrameworks(
  provider: ProviderProfile,
  allowedFrameworks: RaidTaskSpec['constraints']['allowedAgentFrameworks']
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

  const providerName = normalizeFilterValue(provider.modelProvider);
  return (
    providerName.length > 0 &&
    allowedProviders.some((modelProvider) => normalizeFilterValue(modelProvider) === providerName)
  );
}

export function providerMatchesAllowedModelIds(
  provider: ProviderProfile,
  allowedModelIds: string[] | undefined
): boolean {
  if (!allowedModelIds?.length) {
    return true;
  }

  const providerModelId = normalizeFilterValue(provider.modelId);
  return (
    providerModelId.length > 0 &&
    allowedModelIds.some((modelId) => normalizeFilterValue(modelId) === providerModelId)
  );
}

function providerHasVerifiedGeneralServiceMetadata(provider: ProviderProfile): boolean {
  return (
    provider.verification?.status === 'verified' &&
    provider.verification.apiVerified !== false &&
    provider.verification.frameworkVerified !== false &&
    provider.verification.modelVerified !== false
  );
}

export function taskUsesVenicePrivateLane(task: RaidTaskSpec): boolean {
  return (
    task.constraints.privacyMode === 'strict' ||
    (task.constraints.allowedModelFamilies ?? []).some((family) =>
      normalizeModelFamily(family).includes('venice')
    )
  );
}

export function readProviderPrivacyFeatures(provider: ProviderProfile): PrivacyFeatureKey[] {
  const features: PrivacyFeatureKey[] = [];

  if (provider.privacy?.teeAttested) {
    features.push('tee_attested');
  }
  if (provider.privacy?.e2ee) {
    features.push('e2ee');
  }
  if (provider.privacy?.noDataRetention) {
    features.push('no_data_retention');
  }
  if (provider.privacy?.signedOutputs) {
    features.push('signed_outputs');
  }
  if (provider.privacy?.provenanceAttested) {
    features.push('provenance_attested');
  }
  if (provider.privacy?.operatorVerified) {
    features.push('operator_verified');
  }

  return features;
}

export function collectMatchedSpecializations(
  provider: ProviderProfile,
  task: RaidTaskSpec
): string[] {
  const required = new Set(
    task.constraints.requireSpecializations.map((item) => item.toLowerCase())
  );

  if ((task.output?.primaryType ?? 'patch') === 'patch' && task.framework) {
    required.add(String(task.framework).toLowerCase());
  }

  if ((task.output?.primaryType ?? 'patch') === 'patch' && task.language !== 'text') {
    required.add(task.language.toLowerCase());
  }

  if (required.size === 0) {
    return [];
  }

  const offered = new Set([
    ...provider.specializations.map((item) => item.toLowerCase()),
    ...provider.supportedFrameworks.map((item) => item.toLowerCase()),
    ...provider.supportedLanguages.map((item) => item.toLowerCase()),
  ]);

  return [...required].filter((item) => offered.has(item));
}

export function providerMatchesTask(
  provider: ProviderProfile,
  task: RaidTaskSpec,
  maxHeartbeatAgeMs: number = DEFAULT_TIMEOUTS.providerFreshMs,
  options: {
    skipFreshnessCheck?: boolean;
  } = {}
): boolean {
  const isPatchTask = (task.output?.primaryType ?? 'patch') === 'patch';
  const requestedPrimaryOutputType = task.output?.primaryType;
  const frameworkMatch =
    !isPatchTask ||
    !task.framework ||
    provider.supportedFrameworks
      .map((item) => item.toLowerCase())
      .includes(String(task.framework).toLowerCase());

  const languageMatch =
    !isPatchTask || task.language === 'text' || provider.supportedLanguages.includes(task.language);
  if (provider.marketplaceOfferStatus === 'paused') {
    return false;
  }
  if (
    provider.routingCooldownUntil &&
    Number.isFinite(Date.parse(provider.routingCooldownUntil)) &&
    Date.parse(provider.routingCooldownUntil) > Date.now()
  ) {
    return false;
  }

  const reputationMatch =
    (provider.scores?.reputationScore ?? computeReputationScore(provider)) / 100 >=
    task.constraints.minReputation;
  const timeoutMatch = provider.reputation.timeoutRate <= 0.25;
  const priceMatch =
    estimateProviderChargeUsd(provider, task) * Math.max(task.constraints.numExperts, 1) <=
    task.constraints.maxBudgetUsd;
  const verificationMatch =
    task.constraints.requiredVerificationStatus == null ||
    provider.verification?.status === task.constraints.requiredVerificationStatus;
  const modelFamilyMatch = providerMatchesAllowedModelFamilies(
    provider,
    task.constraints.allowedModelFamilies
  );
  const agentFrameworkMatch = providerMatchesAllowedAgentFrameworks(
    provider,
    task.constraints.allowedAgentFrameworks
  );
  const modelProviderMatch = providerMatchesAllowedModelProviders(
    provider,
    task.constraints.allowedModelProviders
  );
  const modelIdMatch = providerMatchesAllowedModelIds(provider, task.constraints.allowedModelIds);
  const primaryOutputMatch =
    requestedPrimaryOutputType == null ||
    provider.outputTypes?.includes(requestedPrimaryOutputType) === true;
  const outputTypeMatch =
    !task.constraints.allowedOutputTypes?.length ||
    task.constraints.allowedOutputTypes.some((outputType) =>
      provider.outputTypes?.includes(outputType)
    );
  const erc8004Match =
    task.constraints.requireErc8004 !== true || providerHasErc8004Identity(provider);
  const trustScore = computeTrustScore(provider);
  const trustMatch =
    typeof task.constraints.minTrustScore !== 'number' ||
    trustScore >= task.constraints.minTrustScore;
  const strictPrivacyMatch =
    task.constraints.privacyMode !== 'strict' ||
    (task.constraints.requirePrivacyFeatures ?? []).every((feature) =>
      providerHasPrivacyFeature(provider, feature)
    );
  const freshMatch = options.skipFreshnessCheck || providerIsFresh(provider, maxHeartbeatAgeMs);

  return (
    languageMatch &&
    frameworkMatch &&
    reputationMatch &&
    timeoutMatch &&
    priceMatch &&
    modelFamilyMatch &&
    agentFrameworkMatch &&
    modelProviderMatch &&
    modelIdMatch &&
    primaryOutputMatch &&
    outputTypeMatch &&
    erc8004Match &&
    trustMatch &&
    verificationMatch &&
    strictPrivacyMatch &&
    providerContextWindowMatches(provider, task) &&
    freshMatch
  );
}

export type ProviderSelectionResult = SelectedProviders & {
  roundRobinCursor?: number;
};

export function selectProviders(
  task: RaidTaskSpec,
  providers: ProviderProfile[],
  maxHeartbeatAgeMs: number = DEFAULT_TIMEOUTS.providerFreshMs,
  options: {
    skipFreshnessCheck?: boolean;
    roundRobinCursor?: number;
  } = {}
): ProviderSelectionResult {
  const eligible = providers
    .filter((provider) => providerMatchesTask(provider, task, maxHeartbeatAgeMs, options))
    .map((provider) => ({
      provider,
      selectionScore: computeSelectionScore(provider, task),
      privacyScore: computePrivacyScore(provider.privacy),
    }));
  const veniceEligible = taskUsesVenicePrivateLane(task)
    ? eligible.filter((item) => providerIsVeniceBacked(item.provider))
    : [];
  const routingPool = veniceEligible.length > 0 ? veniceEligible : eligible;
  const ranked = routingPool.sort((left, right) => compareProviders(left, right, task));

  let nextRoundRobinCursor = options.roundRobinCursor;
  const selected =
    task.constraints.selectionMode === 'round_robin'
      ? (() => {
          const roundRobinResult = selectRoundRobinProviders(
            ranked,
            task.constraints.numExperts,
            nextRoundRobinCursor ?? 0
          );
          nextRoundRobinCursor = roundRobinResult.cursor;
          return roundRobinResult.selected;
        })()
      : task.constraints.selectionMode === 'diverse_mix'
        ? selectDiverseProviders(ranked, task.constraints.numExperts)
        : ranked.slice(0, task.constraints.numExperts);

  const primaries = selected.map((item) => item.provider);
  const reserveCount = primaries.length > 0 ? 1 : 0;
  const reserves = ranked
    .filter(
      (item) => !primaries.some((provider) => provider.providerId === item.provider.providerId)
    )
    .slice(0, reserveCount)
    .map((item) => item.provider);

  const result: ProviderSelectionResult = { primaries, reserves };
  if (task.constraints.selectionMode === 'round_robin') {
    result.roundRobinCursor = nextRoundRobinCursor;
  }

  return result;
}

function selectRoundRobinProviders(
  eligible: Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }>,
  maxProviders: number,
  cursor: number
): {
  selected: Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }>;
  cursor: number;
} {
  const verified = eligible.filter((item) =>
    providerHasVerifiedGeneralServiceMetadata(item.provider)
  );
  const pool = (verified.length > 0 ? verified : eligible).sort((left, right) =>
    left.provider.providerId.localeCompare(right.provider.providerId)
  );

  if (pool.length === 0 || maxProviders <= 0) {
    return { selected: [], cursor };
  }

  const offset = cursor % pool.length;
  const selected = Array.from({ length: Math.min(maxProviders, pool.length) }, (_value, index) => {
    return pool[(offset + index) % pool.length]!;
  });

  return { selected, cursor: cursor + 1 };
}

function compareProviders(
  left: { provider: ProviderProfile; selectionScore: number; privacyScore: number },
  right: { provider: ProviderProfile; selectionScore: number; privacyScore: number },
  task: RaidTaskSpec
): number {
  const mode =
    task.constraints.selectionMode ??
    (task.constraints.privacyMode && task.constraints.privacyMode !== 'off'
      ? 'privacy_first'
      : 'best_match');
  const leftTrustScore = computeTrustScore(left.provider);
  const rightTrustScore = computeTrustScore(right.provider);
  const leftVenice = providerIsVeniceBacked(left.provider);
  const rightVenice = providerIsVeniceBacked(right.provider);
  const trustAwareRouting =
    task.constraints.requireErc8004 === true || typeof task.constraints.minTrustScore === 'number';
  const venicePrivateLane = taskUsesVenicePrivateLane(task);
  const leftChargeUsd = estimateProviderChargeUsd(left.provider, task);
  const rightChargeUsd = estimateProviderChargeUsd(right.provider, task);

  if (mode === 'cost_first' && leftChargeUsd !== rightChargeUsd) {
    return leftChargeUsd - rightChargeUsd;
  }

  if (venicePrivateLane && leftVenice !== rightVenice) {
    return Number(rightVenice) - Number(leftVenice);
  }

  if (trustAwareRouting && rightTrustScore !== leftTrustScore) {
    return rightTrustScore - leftTrustScore;
  }

  if (mode === 'privacy_first' && left.privacyScore !== right.privacyScore) {
    return right.privacyScore - left.privacyScore;
  }

  if (right.selectionScore !== left.selectionScore) {
    return right.selectionScore - left.selectionScore;
  }

  return right.privacyScore - left.privacyScore;
}

function selectDiverseProviders(
  eligible: Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }>,
  maxProviders: number
): Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }> {
  const selected: Array<{
    provider: ProviderProfile;
    selectionScore: number;
    privacyScore: number;
  }> = [];
  const usedFamilies = new Set<string>();

  for (const item of eligible) {
    const family = item.provider.modelFamily ?? item.provider.providerId;
    if (usedFamilies.has(family)) {
      continue;
    }
    selected.push(item);
    usedFamilies.add(family);
    if (selected.length >= maxProviders) {
      return selected;
    }
  }

  for (const item of eligible) {
    if (
      selected.some((selectedItem) => selectedItem.provider.providerId === item.provider.providerId)
    ) {
      continue;
    }
    selected.push(item);
    if (selected.length >= maxProviders) {
      return selected;
    }
  }

  return selected;
}

export function createAssignmentRecords(
  selectedProviders: SelectedProviders
): Record<string, AssignmentRecord> {
  const assignments: Record<string, AssignmentRecord> = {};
  const now = new Date().toISOString();

  for (const provider of selectedProviders.primaries) {
    assignments[provider.providerId] = {
      providerId: provider.providerId,
      status: 'selected',
      invitedAt: now,
      progress: 0,
    };
  }

  for (const provider of selectedProviders.reserves) {
    assignments[provider.providerId] = {
      providerId: provider.providerId,
      status: 'selected',
      invitedAt: now,
      progress: 0,
      message: 'reserve',
    };
  }

  return assignments;
}
