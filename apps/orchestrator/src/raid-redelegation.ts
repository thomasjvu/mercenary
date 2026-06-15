import type { RaidDelegationRecord, RaidRecord } from '@bossraid/shared-types';

export function recordWorkstreamRedelegation(
  raid: RaidRecord,
  providerId: string,
  budgetCapUsd: number
): RaidDelegationRecord {
  const entry: RaidDelegationRecord = {
    fromAgent: 'mercenary-v1',
    toProvider: providerId,
    workstreamId: raid.contributionPlan?.workstreamId,
    workstreamLabel: raid.contributionPlan?.workstreamLabel,
    budgetCapUsd,
    delegatedAt: new Date().toISOString(),
  };

  raid.delegations = [...(raid.delegations ?? []), entry];
  raid.updatedAt = new Date().toISOString();
  return entry;
}
