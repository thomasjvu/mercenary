import type {
  BossRaidResultOutput,
  BossRaidStatusOutput,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderSubmission,
} from '@bossraid/shared-types';
import {
  markAssignmentFailed as markProviderAssignmentFailed,
  markHeartbeat as markProviderHeartbeat,
  submitResult as submitProviderResult,
  type RaidProviderDispatchDeps,
} from './raid-provider-dispatch.js';
import {
  buildRaidStatusOutput,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from './raid-state.js';
import type { RaidLifecycleQueriesContext } from './raid-lifecycle-queries.js';
import { getResult, getStatus } from './raid-lifecycle-queries.js';

export type RaidLifecycleIngressContext = RaidLifecycleQueriesContext & {
  providerDispatchDeps: () => RaidProviderDispatchDeps;
  clearRaidDeadlineTimer: (raidId: string) => void;
  clearProviderTimers: (raidId: string, providerId: string) => void;
  queuePersistBestEffort: () => void;
};

export function markHeartbeat(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  providerId: string,
  heartbeat: ProviderHeartbeat
): void {
  markProviderHeartbeat(raidId, providerId, heartbeat, ctx.providerDispatchDeps());
}

export async function submitResult(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  submission: ProviderSubmission
): Promise<void> {
  await submitProviderResult(raidId, submission, ctx.providerDispatchDeps());
}

export function markAssignmentFailed(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  providerId: string,
  reason: string
): void {
  markProviderAssignmentFailed(raidId, providerId, reason, ctx.providerDispatchDeps());
}

export function recordProviderHeartbeat(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  providerId: string,
  heartbeat: ProviderHeartbeat
): BossRaidStatusOutput {
  const raid = ctx.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return buildRaidStatusOutput(raid);
  }
  markHeartbeat(ctx, raidId, providerId, heartbeat);
  return getStatus(ctx, raidId);
}

export async function recordProviderSubmission(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  submission: ProviderSubmission
): Promise<BossRaidResultOutput> {
  const raid = ctx.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return getResult(ctx, raidId);
  }
  await submitResult(ctx, raidId, submission);
  return getResult(ctx, raidId);
}

export function recordProviderFailure(
  ctx: RaidLifecycleIngressContext,
  raidId: string,
  providerId: string,
  failure: ProviderFailure
): BossRaidStatusOutput {
  const raid = ctx.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return buildRaidStatusOutput(raid);
  }
  markAssignmentFailed(ctx, raidId, providerId, failure.message);
  return getStatus(ctx, raidId);
}

export function abortRaid(ctx: RaidLifecycleIngressContext, raidId: string): BossRaidStatusOutput {
  const raid = ctx.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return getStatus(ctx, raidId);
  }

  const cancelledAt = new Date().toISOString();
  ctx.clearRaidDeadlineTimer(raidId);
  raid.status = 'cancelled';
  raid.updatedAt = cancelledAt;
  if (raid.childRaidIds?.length) {
    for (const childRaidId of raid.childRaidIds) {
      abortRaid(ctx, childRaidId);
    }
  }
  for (const assignment of Object.values(raid.assignments)) {
    ctx.clearProviderTimers(raidId, assignment.providerId);
    if (!TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
      assignment.status = 'disqualified';
      assignment.message = 'raid cancelled';
      assignment.timeoutAt = cancelledAt;
    }
  }
  ctx.queuePersistBestEffort();
  return getStatus(ctx, raidId);
}
