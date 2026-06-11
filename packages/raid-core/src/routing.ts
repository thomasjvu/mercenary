import { randomUUID } from 'node:crypto';
import {
  computeTrustScore,
  providerHasErc8004Identity,
  providerHasPrivacyFeature,
  providerIsVeniceBacked,
} from '@bossraid/provider-registry';
import type {
  BossRaidRoutingDecision,
  BossRaidRoutingProof,
  ProviderProfile,
  RaidContributionPlan,
  RaidQuoteSnapshot,
  RaidTaskSpec,
  RankedSubmission,
  SelectedProviders,
} from '@bossraid/shared-types';
import { DEFAULT_TIMEOUTS } from './constants.js';
import {
  estimateProviderChargeUsd,
  estimateTaskInputTokens,
  estimateTaskOutputTokens,
  readProviderPricing,
} from './pricing.js';
import {
  collectMatchedSpecializations,
  providerMatchesAllowedAgentFrameworks,
  providerMatchesAllowedModelFamilies,
  providerMatchesAllowedModelIds,
  providerMatchesAllowedModelProviders,
  readProviderPrivacyFeatures,
  taskUsesVenicePrivateLane,
} from './selection.js';
import { sha256 } from './utils.js';

function buildRoutingDecision(
  task: RaidTaskSpec,
  provider: ProviderProfile,
  phase: 'primary' | 'reserve'
): BossRaidRoutingDecision {
  const trustScore = computeTrustScore(provider);
  const trustAwareRouting =
    task.constraints.requireErc8004 === true || typeof task.constraints.minTrustScore === 'number';
  const veniceBacked = providerIsVeniceBacked(provider);
  const requiredPrivacyFeatures = task.constraints.requirePrivacyFeatures ?? [];
  const verification = provider.erc8004?.verification;
  const privacyFeatureMatch =
    requiredPrivacyFeatures.length === 0 ||
    requiredPrivacyFeatures.every((feature) => providerHasPrivacyFeature(provider, feature));
  const reasons = [
    phase === 'primary' ? 'selected_primary' : 'reserved_fallback',
    task.constraints.privacyMode === 'strict'
      ? 'strict_privacy'
      : task.constraints.privacyMode === 'prefer'
        ? 'privacy_requested'
        : 'standard_routing',
    taskUsesVenicePrivateLane(task)
      ? veniceBacked
        ? 'venice_private_lane'
        : 'venice_fallback'
      : null,
    providerMatchesAllowedModelFamilies(provider, task.constraints.allowedModelFamilies) &&
    (task.constraints.allowedModelFamilies?.length ?? 0) > 0
      ? 'allowed_model_family'
      : null,
    providerMatchesAllowedAgentFrameworks(provider, task.constraints.allowedAgentFrameworks) &&
    (task.constraints.allowedAgentFrameworks?.length ?? 0) > 0
      ? 'allowed_agent_framework'
      : null,
    providerMatchesAllowedModelProviders(provider, task.constraints.allowedModelProviders) &&
    (task.constraints.allowedModelProviders?.length ?? 0) > 0
      ? 'allowed_model_provider'
      : null,
    providerMatchesAllowedModelIds(provider, task.constraints.allowedModelIds) &&
    (task.constraints.allowedModelIds?.length ?? 0) > 0
      ? 'allowed_model_id'
      : null,
    task.constraints.selectionMode === 'round_robin' ? 'round_robin_selected' : null,
    privacyFeatureMatch && requiredPrivacyFeatures.length > 0 ? 'required_privacy_features' : null,
    task.constraints.requireErc8004 === true && providerHasErc8004Identity(provider)
      ? 'erc8004_required'
      : null,
    typeof task.constraints.minTrustScore === 'number' &&
    trustScore >= task.constraints.minTrustScore
      ? 'trust_threshold_met'
      : null,
    trustAwareRouting && trustScore > 0 ? 'trust_ranked' : null,
    collectMatchedSpecializations(provider, task).length > 0 ? 'specialization_match' : null,
  ].filter((value): value is string => value != null);

  return {
    providerId: provider.providerId,
    phase,
    modelFamily: provider.modelFamily,
    agentFramework: provider.agentFramework,
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    verificationStatus: provider.verification?.status,
    rateUsd: estimateProviderChargeUsd(provider, task),
    pricing: readProviderPricing(provider),
    rateCardHash: readProviderPricing(provider).rateCardHash,
    veniceBacked,
    erc8004Registered: providerHasErc8004Identity(provider),
    trustScore,
    trustReason: provider.trust?.reason,
    operatorWallet: provider.erc8004?.operatorWallet,
    registrationTx: provider.erc8004?.registrationTx,
    erc8004VerificationStatus: verification?.status,
    erc8004VerificationCheckedAt: verification?.checkedAt,
    agentRegistry: verification?.agentRegistry ?? provider.erc8004?.identityRegistry,
    agentUri: verification?.agentUri,
    registrationTxFound: verification?.registrationTxFound,
    operatorMatchesOwner: verification?.operatorMatchesOwner,
    privacyFeatures: readProviderPrivacyFeatures(provider),
    matchedSpecializations: collectMatchedSpecializations(provider, task),
    reasons,
  };
}

export function buildRoutingProof(
  task: RaidTaskSpec,
  selectedProviders: SelectedProviders
): BossRaidRoutingProof {
  return {
    policy: {
      privacyMode: task.constraints.privacyMode ?? 'off',
      selectionMode:
        task.constraints.selectionMode ??
        (task.constraints.privacyMode && task.constraints.privacyMode !== 'off'
          ? 'privacy_first'
          : 'best_match'),
      requireErc8004: task.constraints.requireErc8004 === true,
      minTrustScore: task.constraints.minTrustScore,
      requiredVerificationStatus: task.constraints.requiredVerificationStatus,
      maxInputTokens: task.constraints.maxInputTokens,
      maxOutputTokens: task.constraints.maxOutputTokens,
      allowedModelFamilies: task.constraints.allowedModelFamilies ?? [],
      allowedAgentFrameworks: task.constraints.allowedAgentFrameworks ?? [],
      allowedModelProviders: task.constraints.allowedModelProviders ?? [],
      allowedModelIds: task.constraints.allowedModelIds ?? [],
      requiredPrivacyFeatures: task.constraints.requirePrivacyFeatures ?? [],
      venicePrivateLane: taskUsesVenicePrivateLane(task),
    },
    providers: [
      ...selectedProviders.primaries.map((provider) =>
        buildRoutingDecision(task, provider, 'primary')
      ),
      ...selectedProviders.reserves.map((provider) =>
        buildRoutingDecision(task, provider, 'reserve')
      ),
    ],
  };
}

export function annotateRoutingProof(
  routingProof: BossRaidRoutingProof,
  contributionPlan: RaidContributionPlan | undefined
): BossRaidRoutingProof {
  if (!contributionPlan) {
    return routingProof;
  }

  return {
    ...routingProof,
    providers: routingProof.providers.map((decision) => ({
      ...decision,
      workstreamId: contributionPlan.workstreamId,
      workstreamLabel: contributionPlan.workstreamLabel,
      roleId: contributionPlan.roleId,
      roleLabel: contributionPlan.roleLabel,
      reasons: decision.reasons.includes('workstream_scoped')
        ? decision.reasons
        : [...decision.reasons, 'workstream_scoped'],
    })),
  };
}

export function buildRaidQuoteSnapshot(
  task: RaidTaskSpec,
  selectedProviders: SelectedProviders,
  options: { quoteId?: string; expiresAt?: string; manaPerUsd?: number } = {}
): RaidQuoteSnapshot {
  const now = new Date().toISOString();
  const expiresAt =
    options.expiresAt ?? new Date(Date.now() + DEFAULT_TIMEOUTS.raidAbsoluteMs).toISOString();
  const manaPerUsd = options.manaPerUsd ?? 1_000;
  const providers = [
    ...selectedProviders.primaries.map((provider) => ({ provider, phase: 'primary' as const })),
    ...selectedProviders.reserves.map((provider) => ({ provider, phase: 'reserve' as const })),
  ].map(({ provider, phase }) => ({
    providerId: provider.providerId,
    phase,
    rateCard: { ...readProviderPricing(provider) },
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    upstreamModelId: readProviderPricing(provider).upstreamModelId,
    maxContextTokens: readProviderPricing(provider).maxContextTokens,
    endpointHash: sha256(provider.endpoint),
    verificationStatus: provider.verification?.status,
    trustScore: computeTrustScore(provider),
    privacyFeatures: readProviderPrivacyFeatures(provider),
    erc8004Registered: providerHasErc8004Identity(provider),
    attestationSummary: {
      teeAttested: provider.privacy?.teeAttested,
      teeVendor: provider.privacy?.teeVendor,
      e2ee: provider.privacy?.e2ee,
      signedOutputs: provider.privacy?.signedOutputs,
      noDataRetention: provider.privacy?.noDataRetention,
    },
  }));

  const maxChargeUsd = Math.min(
    task.constraints.maxBudgetUsd,
    Math.max(
      task.constraints.maxBudgetUsd,
      selectedProviders.primaries.reduce(
        (sum, provider) => sum + estimateProviderChargeUsd(provider, task),
        0
      )
    )
  );

  return {
    quoteId: options.quoteId ?? randomUUID(),
    createdAt: now,
    expiresAt,
    modelId: task.constraints.allowedModelIds?.[0],
    selectedSellerIds: selectedProviders.primaries.map((provider) => provider.providerId),
    reserveSellerIds: selectedProviders.reserves.map((provider) => provider.providerId),
    privacyMode: task.constraints.privacyMode,
    requiredPrivacyFeatures: task.constraints.requirePrivacyFeatures ?? [],
    requiredVerificationStatus: task.constraints.requiredVerificationStatus,
    requireErc8004: task.constraints.requireErc8004 === true,
    minTrustScore: task.constraints.minTrustScore,
    estimatedMaxInputTokens: task.constraints.maxInputTokens ?? estimateTaskInputTokens(task),
    estimatedMaxOutputTokens: estimateTaskOutputTokens(task),
    maxChargeUsd,
    manaQuote: {
      manaPerUsd,
      maxChargeMana: Math.ceil(maxChargeUsd * manaPerUsd),
    },
    providers,
  };
}

export function rankSubmissions(submissions: RankedSubmission[]): RankedSubmission[] {
  return [...submissions]
    .sort((left, right) => {
      if (right.breakdown.finalScore !== left.breakdown.finalScore) {
        return right.breakdown.finalScore - left.breakdown.finalScore;
      }

      if (right.breakdown.testScore !== left.breakdown.testScore) {
        return right.breakdown.testScore - left.breakdown.testScore;
      }

      if (left.breakdown.sideEffectSafety !== right.breakdown.sideEffectSafety) {
        return right.breakdown.sideEffectSafety - left.breakdown.sideEffectSafety;
      }

      const leftSize = summarizeSubmissionContent(left.submission).length;
      const rightSize = summarizeSubmissionContent(right.submission).length;
      return leftSize - rightSize;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function summarizeSubmissionContent(submission: RankedSubmission['submission']): string {
  if (submission.patchUnifiedDiff) {
    return submission.patchUnifiedDiff;
  }

  if (submission.answerText) {
    return submission.answerText;
  }

  return (submission.artifacts ?? [])
    .map((artifact) =>
      [artifact.outputType, artifact.label, artifact.description, artifact.mimeType]
        .filter(Boolean)
        .join(' ')
    )
    .join('\n');
}
