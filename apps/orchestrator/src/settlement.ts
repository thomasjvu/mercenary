import { computeRewards, hashSubmission } from "@bossraid/raid-core";
import type { RaidRecord, SettlementAllocation, SettlementSummary } from "@bossraid/shared-types";

export function buildSettlementAllocations(raid: RaidRecord): SettlementAllocation[] {
  if (raid.rankedSubmissions.length === 0) {
    return [];
  }

  const rewards = computeRewards(
    raid.task.constraints.maxBudgetUsd,
    raid.rankedSubmissions,
    raid.task.rewardPolicy,
  );

  return raid.selectedProviders.map((providerId) => {
    const ranked = raid.rankedSubmissions.find((item) => item.submission.providerId === providerId);
    const valid = Boolean(ranked?.breakdown.valid);

    return {
      providerId,
      role: valid ? "successful" : "unsuccessful",
      status: valid ? "complete" : "reject",
      totalAmount: valid ? rewards.payoutPerSuccessfulProvider : 0,
      deliverableHash: ranked
        ? `0x${hashSubmission(
            ranked.submission.patchUnifiedDiff ?? ranked.submission.answerText ?? "",
            ranked.submission.explanation,
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
    raid.task.constraints.maxBudgetUsd,
    raid.rankedSubmissions,
    raid.task.rewardPolicy,
  );

  return {
    successfulProviderCount: rewards.successfulProviderCount,
    successfulProvidersPaid: rewards.successfulProvidersPaid,
    payoutPerSuccessfulProvider: rewards.payoutPerSuccessfulProvider,
  };
}
