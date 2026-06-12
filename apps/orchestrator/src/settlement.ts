import { computeRewards, hashSubmission } from '@bossraid/raid-core';
import type { RaidRecord, SettlementAllocation, SettlementSummary } from '@bossraid/shared-types';
import {
  isSingleProviderGeneralServiceRaid,
  resolveMinimumPayoutThresholdUsd,
} from './settlement-threshold.js';

function computeSettlementRewards(raid: RaidRecord) {
  return computeRewards(
    readSettlementBudgetUsd(raid),
    raid.rankedSubmissions,
    raid.task.rewardPolicy,
    {
      minimumPayoutThresholdUsd: resolveMinimumPayoutThresholdUsd(raid),
    }
  );
}

export function buildSettlementAllocations(raid: RaidRecord): SettlementAllocation[] {
  if (raid.rankedSubmissions.length === 0) {
    return [];
  }

  const rewards = computeSettlementRewards(raid);

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

  const rewards = computeSettlementRewards(raid);

  return {
    successfulProviderCount: rewards.successfulProviderCount,
    successfulProvidersPaid: rewards.successfulProvidersPaid,
    payoutPerSuccessfulProvider: rewards.payoutPerSuccessfulProvider,
    escrowFundingUsd: raid.escrowFundingUsd ?? 0,
    platformMarkupUsd: raid.platformMarkupUsd ?? 0,
    minimumPayoutThresholdUsd: resolveMinimumPayoutThresholdUsd(raid),
    approvedProviderCount: raid.selectedProviders.length,
  };
}

function readSettlementBudgetUsd(raid: RaidRecord): number {
  const requestedBudget = raid.task.constraints.maxBudgetUsd;
  const paidBudget =
    typeof raid.escrowFundingUsd === 'number' && raid.escrowFundingUsd > 0
      ? raid.escrowFundingUsd
      : requestedBudget;

  if (!isSingleProviderGeneralServiceRaid(raid)) {
    return paidBudget;
  }

  const providerId = raid.selectedProviders[0];
  const providerRate = raid.routingProof?.providers.find(
    (provider) => provider.providerId === providerId && provider.phase === 'primary'
  )?.rateUsd;

  if (typeof providerRate !== 'number' || !Number.isFinite(providerRate) || providerRate <= 0) {
    return paidBudget;
  }

  return Math.min(paidBudget, providerRate);
}
