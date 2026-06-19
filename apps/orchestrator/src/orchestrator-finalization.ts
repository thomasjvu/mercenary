import { TIMEOUTS } from '@bossraid/constants';
import type { RaidRecord, ReputationEventType } from '@bossraid/shared-types';
import { maybeReplanHierarchicalRaid } from './raid-adaptive.js';
import { refreshParentRaidFromChildren } from './raid-hierarchy.js';
import {
  applyDisqualificationToRaid,
  finalizeRaidRecord,
  shouldFinalizeRaid,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from './raid-state.js';
import type { RaidDeadlineTimerRegistry } from './raid-timers.js';
import { delay } from './runtime.js';
import { maybeSynthesizeWithVenice } from './venice-planner.js';

export type OrchestratorFinalizationDeps = {
  requireRaid: (raidId: string) => RaidRecord;
  raidDeadlineTimers: RaidDeadlineTimerRegistry;
  clearRaidDeadlineTimer: (raidId: string) => void;
  clearProviderTimers: (raidId: string, providerId: string) => void;
  applyReputationEvent: (
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>
  ) => void;
  refreshRaidAncestry: (raidId: string | undefined) => void;
  queuePersistBestEffort: () => void;
  executeSettlement: (raidId: string) => Promise<void>;
  raidDeadlineReached: (raid: RaidRecord) => boolean;
  adaptiveReplanDeps: () => Parameters<typeof maybeReplanHierarchicalRaid>[1];
};

export function shouldFinalizeHierarchicalRaid(
  raid: RaidRecord,
  deps: Pick<OrchestratorFinalizationDeps, 'requireRaid'>
): boolean {
  return (raid.childRaidIds ?? []).every((childRaidId) =>
    TERMINAL_RAID_STATUSES.has(deps.requireRaid(childRaidId).status)
  );
}

export async function finalizeRaid(
  raid: RaidRecord,
  deps: OrchestratorFinalizationDeps
): Promise<void> {
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (!deps.raidDeadlineTimers.tryMarkFinalizing(raid.id)) {
    return;
  }

  try {
    await runFinalizeRaid(raid, deps);
  } finally {
    deps.raidDeadlineTimers.unmarkFinalizing(raid.id);
  }
}

async function runFinalizeRaid(
  raid: RaidRecord,
  deps: OrchestratorFinalizationDeps
): Promise<void> {
  deps.clearRaidDeadlineTimer(raid.id);
  if (raid.childRaidIds?.length) {
    refreshParentRaidFromChildren(raid.id, (childRaidId) => deps.requireRaid(childRaidId));
  }
  finalizeRaidRecord(raid);

  if (raid.parentRaidId == null) {
    const veniceAnswer = await maybeSynthesizeWithVenice(raid);
    if (veniceAnswer && raid.synthesizedOutput) {
      raid.synthesizedOutput = {
        ...raid.synthesizedOutput,
        answerText: veniceAnswer,
      };
      raid.updatedAt = new Date().toISOString();
    }
  }

  if (raid.parentRaidId == null) {
    for (const submission of raid.rankedSubmissions.filter((item) => item.breakdown.valid)) {
      deps.applyReputationEvent(submission.submission.providerId, 'successful_provider', {
        raidId: raid.id,
      });
    }
  }

  if (raid.parentRaidId) {
    deps.refreshRaidAncestry(raid.parentRaidId);
    maybeFinalizeAfterUpdate(raid.parentRaidId, deps);
  }
  deps.queuePersistBestEffort();
  if (raid.parentRaidId == null) {
    await deps.executeSettlement(raid.id);
  }
}

export function expireRaidAtDeadline(raidId: string, deps: OrchestratorFinalizationDeps): void {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status) || !deps.raidDeadlineTimers.tryMarkExpiring(raidId)) {
    return;
  }
  deps.clearRaidDeadlineTimer(raidId);

  try {
    const reason = 'raid deadline reached before completion';
    if (raid.childRaidIds?.length) {
      for (const childRaidId of raid.childRaidIds) {
        const childRaid = deps.requireRaid(childRaidId);
        if (!TERMINAL_RAID_STATUSES.has(childRaid.status)) {
          expireRaidAtDeadline(childRaidId, deps);
        }
      }
    }
    for (const providerId of raid.selectedProviders) {
      const assignment = raid.assignments[providerId];
      if (!assignment || TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        continue;
      }
      if (!applyDisqualificationToRaid(raid, providerId, reason)) {
        continue;
      }

      deps.clearProviderTimers(raidId, providerId);
      deps.applyReputationEvent(
        providerId,
        assignment.acceptedAt ? 'heartbeat_timeout' : 'invite_timeout',
        { raidId, reason }
      );
    }

    if (raid.parentRaidId) {
      deps.refreshRaidAncestry(raid.parentRaidId);
      maybeFinalizeAfterUpdate(raid.parentRaidId, deps);
    }
    deps.queuePersistBestEffort();
    void finalizeRaid(raid, deps);
  } finally {
    deps.raidDeadlineTimers.unmarkExpiring(raidId);
  }
}

export function maybeFinalizeAfterUpdate(raidId: string, deps: OrchestratorFinalizationDeps): void {
  const raid = deps.requireRaid(raidId);
  if (deps.raidDeadlineReached(raid)) {
    expireRaidAtDeadline(raidId, deps);
    return;
  }
  if (raid.childRaidIds?.length) {
    refreshParentRaidFromChildren(raidId, (childRaidId) => deps.requireRaid(childRaidId));
    if (raid.adaptivePlanning && maybeReplanHierarchicalRaid(raidId, deps.adaptiveReplanDeps())) {
      return;
    }
    if (shouldFinalizeHierarchicalRaid(raid, deps)) {
      void finalizeRaid(raid, deps);
      return;
    }
    if (raid.parentRaidId) {
      maybeFinalizeAfterUpdate(raid.parentRaidId, deps);
    }
    return;
  }

  if (shouldFinalizeRaid(raid)) {
    void finalizeRaid(raid, deps);
    return;
  }

  if (raid.parentRaidId) {
    maybeFinalizeAfterUpdate(raid.parentRaidId, deps);
  }
}

export async function waitForFinalization(
  raidId: string,
  deps: OrchestratorFinalizationDeps
): Promise<void> {
  const deadline = deps.requireRaid(raidId).deadlineUnix * 1_000;

  while (Date.now() < deadline) {
    const raid = deps.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }
    await delay(TIMEOUTS.RAID_POLL_INTERVAL);
  }

  const raid = deps.requireRaid(raidId);
  if (!TERMINAL_RAID_STATUSES.has(raid.status)) {
    expireRaidAtDeadline(raidId, deps);
  }
}
