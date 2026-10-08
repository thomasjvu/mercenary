import { readSettlementMinPayoutUsd } from '@bossraid/constants';
import type { RaidRecord } from '@bossraid/shared-types';

export function resolveMinimumPayoutThresholdUsd(
  raid: RaidRecord,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (typeof raid.task.constraints.minimumPayoutThresholdUsd === 'number') {
    return Math.max(0, raid.task.constraints.minimumPayoutThresholdUsd);
  }

  return readSettlementMinPayoutUsd(env);
}
