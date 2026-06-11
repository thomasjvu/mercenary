import { buildRoutingProof, readProviderPrivacyFeatures } from '@bossraid/raid-core';
import { computeTrustScore, providerHasErc8004Identity } from '@bossraid/provider-registry';
import type {
  BossRaidRoutingProof,
  PrivacyFeatureKey,
  ProviderProfile,
  RaidRecord,
} from '@bossraid/shared-types';

export function buildProviderTrustRecord(
  providerId: string,
  provider: ProviderProfile | undefined
) {
  return {
    providerId,
    erc8004Registered: provider != null && providerHasErc8004Identity(provider),
    trustScore: provider == null ? 0 : computeTrustScore(provider),
    trustReason: provider?.trust?.reason,
    operatorWallet: provider?.erc8004?.operatorWallet,
    registrationTx: provider?.erc8004?.registrationTx,
    erc8004VerificationStatus: provider?.erc8004?.verification?.status,
    erc8004VerificationCheckedAt: provider?.erc8004?.verification?.checkedAt,
    agentRegistry:
      provider?.erc8004?.verification?.agentRegistry ?? provider?.erc8004?.identityRegistry,
    agentUri: provider?.erc8004?.verification?.agentUri,
    registrationTxFound: provider?.erc8004?.verification?.registrationTxFound,
    operatorMatchesOwner: provider?.erc8004?.verification?.operatorMatchesOwner,
  };
}

export function buildRoutingProofLog(
  rootRaid: RaidRecord,
  executionRaids: RaidRecord[],
  getProvider?: (providerId: string) => ProviderProfile | undefined
): BossRaidRoutingProof | undefined {
  const providers = executionRaids.flatMap((currentRaid) => {
    if (currentRaid.routingProof?.providers.length) {
      return currentRaid.routingProof.providers;
    }

    return [...currentRaid.selectedProviders, ...currentRaid.reserveProviders].map((providerId) =>
      buildFallbackRoutingDecision(providerId, currentRaid, getProvider?.(providerId))
    );
  });

  if (providers.length === 0) {
    return undefined;
  }

  return {
    policy:
      rootRaid.routingProof?.policy ??
      buildRoutingProof(rootRaid.task, { primaries: [], reserves: [] }).policy,
    providers,
  };
}

function buildFallbackRoutingDecision(
  providerId: string,
  raid: RaidRecord,
  provider: ProviderProfile | undefined
): BossRaidRoutingProof['providers'][number] {
  const trustRecord = buildProviderTrustRecord(providerId, provider);

  return {
    providerId,
    phase: raid.selectedProviders.includes(providerId) ? 'primary' : 'reserve',
    workstreamId: raid.contributionPlan?.workstreamId,
    workstreamLabel: raid.contributionPlan?.workstreamLabel,
    roleId: raid.contributionPlan?.roleId,
    roleLabel: raid.contributionPlan?.roleLabel,
    modelFamily: provider?.modelFamily,
    veniceBacked: (provider?.modelFamily ?? '').toLowerCase().includes('venice'),
    erc8004Registered: trustRecord.erc8004Registered,
    trustScore: trustRecord.trustScore,
    trustReason: trustRecord.trustReason,
    operatorWallet: trustRecord.operatorWallet,
    registrationTx: trustRecord.registrationTx,
    erc8004VerificationStatus: trustRecord.erc8004VerificationStatus,
    erc8004VerificationCheckedAt: trustRecord.erc8004VerificationCheckedAt,
    agentRegistry: trustRecord.agentRegistry,
    agentUri: trustRecord.agentUri,
    registrationTxFound: trustRecord.registrationTxFound,
    operatorMatchesOwner: trustRecord.operatorMatchesOwner,
    privacyFeatures: provider ? readProviderPrivacyFeatures(provider) : ([] as PrivacyFeatureKey[]),
    matchedSpecializations: [],
    reasons: [
      raid.selectedProviders.includes(providerId) ? 'selected_primary' : 'reserved_fallback',
      raid.task.constraints.privacyMode === 'strict' ? 'strict_privacy' : 'standard_routing',
    ],
  };
}
