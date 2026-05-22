import { computeRewards, hashSubmission } from '@bossraid/raid-core';
import type { RaidRecord, SettlementAllocation, SettlementSummary } from '@bossraid/shared-types';

export function buildSettlementAllocations(raid: RaidRecord): SettlementAllocation[] {
  if (raid.rankedSubmissions.length === 0) {
    return [];
  }

  const rewards = computeRewards(
    readSettlementBudgetUsd(raid),
    raid.rankedSubmissions,
    raid.task.rewardPolicy
  );

  return raid.selectedProviders.map((providerId) => {
    const ranked = raid.rankedSubmissions.find((item) => item.submission.providerId === providerId);
    const valid = Boolean(ranked?.breakdown.valid);

    return {
      providerId,
      role: valid ? 'successful' : 'unsuccessful',
      status: valid ? 'complete' : 'reject',
      totalAmount: valid ? rewards.payoutPerSuccessfulProvider : 0,
      deliverableHash: ranked
        ? `0x${hashSubmission(
            ranked.submission.patchUnifiedDiff ?? ranked.submission.answerText ?? '',
            ranked.submission.explanation
          )}`
        : undefined,
    };
  });
}

export function buildSettlementSummary(raid: RaidRecord): SettlementSummary | undefined {
  if (raid.rankedSubmissions.length === 0) {
    return undefined;
  }

  const rewards = computeRewards(
    readSettlementBudgetUsd(raid),
    raid.rankedSubmissions,
    raid.task.rewardPolicy
  );

  return {
    successfulProviderCount: rewards.successfulProviderCount,
    successfulProvidersPaid: rewards.successfulProvidersPaid,
    payoutPerSuccessfulProvider: rewards.payoutPerSuccessfulProvider,
    escrowFundingUsd: raid.escrowFundingUsd ?? 0,
    platformMarkupUsd: raid.platformMarkupUsd ?? 0,
    minimumPayoutThresholdUsd: raid.task.constraints.minimumPayoutThresholdUsd ?? 0.25,
    approvedProviderCount: raid.selectedProviders.length,
  };
}

function readSettlementBudgetUsd(raid: RaidRecord): number {
  if (!isSingleProviderGeneralServiceRaid(raid)) {
    return raid.task.constraints.maxBudgetUsd;
  }

  const providerId = raid.selectedProviders[0];
  const providerRate = raid.routingProof?.providers.find(
    (provider) => provider.providerId === providerId && provider.phase === 'primary'
  )?.rateUsd;

  if (typeof providerRate !== 'number' || !Number.isFinite(providerRate) || providerRate <= 0) {
    return raid.task.constraints.maxBudgetUsd;
  }

  return Math.min(raid.task.constraints.maxBudgetUsd, providerRate);
}

function isSingleProviderGeneralServiceRaid(raid: RaidRecord): boolean {
  const constraints = raid.task.constraints;
  return (
    constraints.numExperts === 1 &&
    raid.selectedProviders.length === 1 &&
    ((constraints.allowedAgentFrameworks?.length ?? 0) > 0 ||
      (constraints.allowedModelProviders?.length ?? 0) > 0 ||
      (constraints.allowedModelIds?.length ?? 0) > 0 ||
      constraints.selectionMode === 'round_robin')
  );
}
