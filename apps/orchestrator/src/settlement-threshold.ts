import {
  INFERENCE_SETTLEMENT_MIN_PAYOUT_USD,
  readSettlementMinPayoutUsd,
} from '@bossraid/constants';
import type { RaidRecord } from '@bossraid/shared-types';

export function isSingleProviderGeneralServiceRaid(raid: RaidRecord): boolean {
  const constraints = raid.task.constraints;
  return (
    constraints.numExperts === 1 &&
    raid.selectedProviders.length === 1 &&
    ((constraints.allowedAgentFrameworks?.length ?? 0) > 0 ||
      (constraints.allowedModelProviders?.length ?? 0) > 0 ||
      (constraints.allowedModelIds?.length ?? 0) > 0 ||
      constraints.selectionMode === 'round_robin' ||
      constraints.selectionMode === 'cost_first')
  );
}

export function resolveMinimumPayoutThresholdUsd(
  raid: RaidRecord,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (typeof raid.task.constraints.minimumPayoutThresholdUsd === 'number') {
    return Math.max(0, raid.task.constraints.minimumPayoutThresholdUsd);
  }

  if (isSingleProviderGeneralServiceRaid(raid)) {
    return INFERENCE_SETTLEMENT_MIN_PAYOUT_USD;
  }

  return readSettlementMinPayoutUsd(env);
}
