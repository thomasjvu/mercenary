import { evaluateSubmission } from '@bossraid/evaluation';
import { validateSubmissionPrivacy } from '@bossraid/privacy-engine';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  AssignmentRecord,
  ProviderHeartbeat,
  ProviderProfile,
  ProviderSubmission,
  RaidRecord,
  ReputationEventType,
} from '@bossraid/shared-types';
import { refreshParentRaidFromChildren } from './raid-hierarchical.js';
import {
  applyFailureToRaid,
  applyHeartbeatToRaid,
  applySubmissionToRaid,
  applyTimeoutToRaid,
  promoteReserveProvider,
  TERMINAL_ASSIGNMENT_STATUSES,
  TERMINAL_RAID_STATUSES,
} from './raid-state.js';
import { timeoutReject, type RuntimeOptions } from './runtime.js';
import { buildProviderTaskPackage } from './task-package.js';
import type { ProviderTimerRegistry } from './timer-registry.js';

export type RaidProviderDispatchDeps = {
  requireRaid: (raidId: string) => RaidRecord;
  getProvider: (providerId: string) => ProviderProfile | undefined;
  getProviderRuntime: (providerId: string) => RaidProvider | undefined;
  updateProviderProfile: (providerId: string, update: (profile: ProviderProfile) => void) => void;
  options: RuntimeOptions;
  timers: ProviderTimerRegistry;
  clearProviderTimers: (raidId: string, providerId: string) => void;
  queuePersistBestEffort: () => void;
  raidDeadlineReached: (raid: RaidRecord) => boolean;
  expireRaidAtDeadline: (raidId: string) => void;
  scheduleRaidDeadline: (raidId: string) => void;
  refreshRaidAncestry: (raidId: string | undefined) => void;
  maybeFinalizeAfterUpdate: (raidId: string) => void;
  applyReputationEvent: (
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>
  ) => void;
  applyProviderRoutingCooldown: (providerId: string, cooldownMs?: number) => void;
  finalizeRaid: (raid: RaidRecord) => void;
  maybeReplanHierarchicalRaid: (raidId: string) => boolean;
  shouldFinalizeHierarchicalRaid: (raid: RaidRecord) => boolean;
  waitForFinalization: (raidId: string) => Promise<void>;
};

export async function resumeRaid(raidId: string, deps: RaidProviderDispatchDeps): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (deps.raidDeadlineReached(raid)) {
    deps.expireRaidAtDeadline(raidId);
    return;
  }

  deps.scheduleRaidDeadline(raidId);

  if (raid.childRaidIds?.length) {
    for (const childRaidId of raid.childRaidIds) {
      if (!TERMINAL_RAID_STATUSES.has(deps.requireRaid(childRaidId).status)) {
        await resumeRaid(childRaidId, deps);
      }
    }
    refreshParentRaidFromChildren(raidId, deps.requireRaid);
    if (deps.maybeReplanHierarchicalRaid(raidId)) {
      return;
    }
    if (deps.shouldFinalizeHierarchicalRaid(raid)) {
      deps.finalizeRaid(raid);
      return;
    }
    deps.queuePersistBestEffort();
    return;
  }

  let dispatchedProvider = false;
  for (const assignment of Object.values(raid.assignments)) {
    if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
      continue;
    }

    if (
      assignment.status === 'selected' &&
      !raid.selectedProviders.includes(assignment.providerId)
    ) {
      continue;
    }

    if (
      assignment.providerRunId &&
      (assignment.status === 'accepted' || assignment.status === 'running')
    ) {
      resumeProviderAssignment(raidId, assignment, deps);
      continue;
    }

    dispatchedProvider = true;
    void dispatchProvider(raidId, assignment.providerId, deps);
  }

  if (!dispatchedProvider) {
    deps.maybeFinalizeAfterUpdate(raidId);
  }

  deps.queuePersistBestEffort();
}

export function resumeProviderAssignment(
  raidId: string,
  assignment: AssignmentRecord,
  deps: RaidProviderDispatchDeps
): void {
  const raid = deps.requireRaid(raidId);
  const nowMs = Date.now();

  deps.clearProviderTimers(raidId, assignment.providerId);

  const remainingHardMs = Math.max(
    1,
    Math.min(
      raid.deadlineUnix * 1_000 - nowMs,
      deps.options.hardExecutionMs -
        Math.max(
          0,
          nowMs - Date.parse(assignment.acceptedAt ?? assignment.invitedAt ?? raid.createdAt)
        )
    )
  );
  deps.timers.setHardTimeout(raidId, assignment.providerId, remainingHardMs, () => {
    markTimedOut(raidId, assignment.providerId, 'hard execution timeout', deps);
  });

  if (!assignment.firstHeartbeatAt) {
    const remainingFirstHeartbeatMs =
      deps.options.firstHeartbeatMs -
      Math.max(
        0,
        nowMs - Date.parse(assignment.acceptedAt ?? assignment.invitedAt ?? raid.createdAt)
      );
    if (remainingFirstHeartbeatMs <= 0) {
      markTimedOut(raidId, assignment.providerId, 'first heartbeat timeout', deps);
      return;
    }

    deps.timers.setFirstHeartbeatTimeout(
      raidId,
      assignment.providerId,
      remainingFirstHeartbeatMs,
      () => {
        const current = deps.requireRaid(raidId).assignments[assignment.providerId];
        if (!current.firstHeartbeatAt && !TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
          markTimedOut(raidId, assignment.providerId, 'first heartbeat timeout', deps);
        }
      }
    );
    return;
  }

  const remainingHeartbeatMs =
    deps.options.heartbeatStaleMs -
    Math.max(0, nowMs - Date.parse(assignment.lastHeartbeatAt ?? assignment.firstHeartbeatAt));
  if (remainingHeartbeatMs <= 0) {
    markTimedOut(raidId, assignment.providerId, 'heartbeat stale', deps);
    return;
  }

  deps.timers.setHeartbeatStaleTimeout(raidId, assignment.providerId, remainingHeartbeatMs, () => {
    const current = deps.requireRaid(raidId).assignments[assignment.providerId];
    if (!TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
      markTimedOut(raidId, assignment.providerId, 'heartbeat stale', deps);
    }
  });
}

export async function runRaid(raidId: string, deps: RaidProviderDispatchDeps): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (deps.raidDeadlineReached(raid)) {
    deps.expireRaidAtDeadline(raidId);
    return;
  }
  if (raid.childRaidIds?.length) {
    await runHierarchicalRaid(raidId, deps);
    return;
  }
  raid.status = 'dispatching';
  raid.updatedAt = new Date().toISOString();
  deps.queuePersistBestEffort();

  const runs = raid.selectedProviders.map((providerId) =>
    dispatchProvider(raidId, providerId, deps)
  );
  await Promise.allSettled(runs);

  await deps.waitForFinalization(raidId);
  const fresh = deps.requireRaid(raidId);
  if (!TERMINAL_RAID_STATUSES.has(fresh.status)) {
    deps.finalizeRaid(fresh);
  }
}

export async function runHierarchicalRaid(
  raidId: string,
  deps: RaidProviderDispatchDeps
): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (deps.raidDeadlineReached(raid)) {
    deps.expireRaidAtDeadline(raidId);
    return;
  }

  raid.status = 'dispatching';
  raid.updatedAt = new Date().toISOString();
  deps.queuePersistBestEffort();

  const childRuns = (raid.childRaidIds ?? []).map((childRaidId) => runRaid(childRaidId, deps));
  await Promise.allSettled(childRuns);

  const fresh = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(fresh.status)) {
    return;
  }
  if (deps.raidDeadlineReached(fresh)) {
    deps.expireRaidAtDeadline(raidId);
    return;
  }

  refreshParentRaidFromChildren(raidId, deps.requireRaid);
  if (deps.maybeReplanHierarchicalRaid(raidId)) {
    return;
  }
  if (deps.shouldFinalizeHierarchicalRaid(fresh)) {
    deps.finalizeRaid(fresh);
    return;
  }

  deps.queuePersistBestEffort();
}

export async function dispatchProvider(
  raidId: string,
  providerId: string,
  deps: RaidProviderDispatchDeps
): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (deps.raidDeadlineReached(raid)) {
    deps.expireRaidAtDeadline(raidId);
    return;
  }
  const provider = deps.getProviderRuntime(providerId);

  if (!provider) {
    markAssignmentFailed(raidId, providerId, 'provider runtime missing', deps);
    return;
  }

  const taskPackage = buildProviderTaskPackage(raid.id, raid.task, {
    deadlineUnix: raid.deadlineUnix,
    providerIndex:
      raid.contributionPlan?.providerIndex ??
      Math.max(raid.selectedProviders.indexOf(providerId), 0) + 1,
    totalExperts: raid.contributionPlan?.totalExperts ?? Math.max(raid.selectedProviders.length, 1),
    providerSpecializations: provider.profile.specializations,
    contributionPlan: raid.contributionPlan,
  });

  const assignment = raid.assignments[providerId];
  assignment.contributionRole =
    taskPackage.synthesis == null
      ? undefined
      : {
          id: taskPackage.synthesis.roleId,
          label: taskPackage.synthesis.roleLabel,
          objective: taskPackage.synthesis.roleObjective,
          workstreamId: taskPackage.synthesis.workstreamId,
          workstreamLabel: taskPackage.synthesis.workstreamLabel,
          workstreamObjective: taskPackage.synthesis.workstreamObjective,
        };
  assignment.status = 'invited';
  assignment.invitedAt = new Date().toISOString();
  assignment.message = 'dispatching';
  raid.status = 'running';
  raid.updatedAt = new Date().toISOString();
  deps.queuePersistBestEffort();

  deps.clearProviderTimers(raidId, providerId);
  deps.timers.setHardTimeout(raidId, providerId, deps.options.hardExecutionMs, () => {
    markTimedOut(raidId, providerId, 'hard execution timeout', deps);
  });

  try {
    const acceptance = await Promise.race([
      provider.accept(taskPackage),
      timeoutReject(deps.options.inviteAcceptMs, 'invite timeout'),
    ]);

    if (!acceptance.accepted) {
      markTimedOut(raidId, providerId, 'invite rejected', deps);
      return;
    }

    const acceptedAt = new Date().toISOString();
    const activeRaid = deps.requireRaid(raidId);
    if (TERMINAL_RAID_STATUSES.has(activeRaid.status)) {
      deps.clearProviderTimers(raidId, providerId);
      return;
    }

    const activeAssignment = activeRaid.assignments[providerId];
    if (TERMINAL_ASSIGNMENT_STATUSES.has(activeAssignment.status)) {
      deps.clearProviderTimers(raidId, providerId);
      return;
    }

    activeAssignment.status = 'accepted';
    activeAssignment.acceptedAt = acceptedAt;
    activeAssignment.providerRunId = acceptance.providerRunId;
    activeAssignment.message = 'accepted';
    deps.updateProviderProfile(providerId, (profile) => {
      profile.status = 'available';
      profile.lastSeenAt = acceptedAt;
    });
    deps.queuePersistBestEffort();

    deps.timers.setFirstHeartbeatTimeout(raidId, providerId, deps.options.firstHeartbeatMs, () => {
      const current = deps.requireRaid(raidId).assignments[providerId];
      if (!current.firstHeartbeatAt && !TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
        markTimedOut(raidId, providerId, 'first heartbeat timeout', deps);
      }
    });

    void Promise.resolve(
      provider.run(taskPackage, {
        onHeartbeat: async (heartbeat) => {
          markHeartbeat(raidId, providerId, heartbeat, deps);
        },
        onSubmit: async (submission) => {
          await submitResult(raidId, submission, deps);
        },
        onFailure: async (error) => {
          markAssignmentFailed(raidId, providerId, error.message, deps);
        },
      })
    ).catch((error) => {
      markAssignmentFailed(
        raidId,
        providerId,
        error instanceof Error ? error.message : 'provider run failed',
        deps
      );
    });
  } catch (error) {
    markTimedOut(
      raidId,
      providerId,
      error instanceof Error ? error.message : 'provider dispatch failed',
      deps
    );
  }
}

export function markHeartbeat(
  raidId: string,
  providerId: string,
  heartbeat: ProviderHeartbeat,
  deps: RaidProviderDispatchDeps
): void {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (!applyHeartbeatToRaid(raid, providerId, heartbeat)) {
    return;
  }
  deps.timers.clearFirstHeartbeat(raidId, providerId);
  deps.timers.setHeartbeatStaleTimeout(raidId, providerId, deps.options.heartbeatStaleMs, () => {
    const current = deps.requireRaid(raidId).assignments[providerId];
    if (!TERMINAL_ASSIGNMENT_STATUSES.has(current.status)) {
      markTimedOut(raidId, providerId, 'heartbeat stale', deps);
    }
  });
  deps.updateProviderProfile(providerId, (profile) => {
    profile.status = 'available';
    profile.lastSeenAt = heartbeat.timestamp;
  });
  if (raid.parentRaidId) {
    deps.refreshRaidAncestry(raid.parentRaidId);
  }
  deps.queuePersistBestEffort();
}

export async function submitResult(
  raidId: string,
  submission: ProviderSubmission,
  deps: RaidProviderDispatchDeps
): Promise<void> {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  const assignment = raid.assignments[submission.providerId];
  const normalizedSubmission =
    submission.contributionRole == null && assignment?.contributionRole != null
      ? {
          ...submission,
          contributionRole: assignment.contributionRole,
        }
      : submission;
  const breakdown = await evaluateSubmission(raid, normalizedSubmission);
  const privacyConstraints = raid.task.constraints;
  const requiredPrivacyFeatures = privacyConstraints.requirePrivacyFeatures ?? [];
  const shouldValidatePrivacy =
    privacyConstraints.privacyMode === 'strict' ||
    (privacyConstraints.privacyMode !== 'off' && requiredPrivacyFeatures.length > 0);

  if (shouldValidatePrivacy) {
    const privacyResult = validateSubmissionPrivacy(
      normalizedSubmission,
      requiredPrivacyFeatures,
      raid.task.sanitizationReport
    );
    breakdown.privacyComplianceScore = privacyResult.score;
    breakdown.privacyComplianceDetails = privacyResult;

    if (privacyConstraints.privacyMode === 'strict' && !privacyResult.passed) {
      breakdown.valid = false;
      if (!breakdown.invalidReasons.includes('privacy_non_compliant')) {
        breakdown.invalidReasons.push('privacy_non_compliant');
      }
      breakdown.summary = [breakdown.summary, 'Strict privacy compliance failed.']
        .filter(Boolean)
        .join(' ');
    }
  }

  deps.clearProviderTimers(raidId, submission.providerId);
  applySubmissionToRaid(raid, normalizedSubmission, breakdown);

  deps.applyReputationEvent(
    submission.providerId,
    breakdown.valid ? 'valid_submission' : 'invalid_submission',
    { raidId, finalScore: breakdown.finalScore }
  );

  if (breakdown.invalidReasons.includes('duplicate_submission')) {
    deps.applyReputationEvent(submission.providerId, 'duplicate_submission', { raidId });
  }

  if (raid.parentRaidId) {
    deps.refreshRaidAncestry(raid.parentRaidId);
    deps.maybeFinalizeAfterUpdate(raid.parentRaidId);
  }
  deps.maybeFinalizeAfterUpdate(raidId);
  deps.queuePersistBestEffort();
}

export function markTimedOut(
  raidId: string,
  providerId: string,
  reason: string,
  deps: RaidProviderDispatchDeps
): void {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (!applyTimeoutToRaid(raid, providerId, reason)) {
    return;
  }

  deps.clearProviderTimers(raidId, providerId);
  deps.applyReputationEvent(
    providerId,
    reason.includes('invite') ? 'invite_timeout' : 'heartbeat_timeout',
    { raidId, reason }
  );
  if (raid.parentRaidId) {
    deps.refreshRaidAncestry(raid.parentRaidId);
    deps.maybeFinalizeAfterUpdate(raid.parentRaidId);
  }
  promoteReserve(raidId, deps);
  deps.maybeFinalizeAfterUpdate(raidId);
  deps.queuePersistBestEffort();
}

export function markAssignmentFailed(
  raidId: string,
  providerId: string,
  reason: string,
  deps: RaidProviderDispatchDeps
): void {
  const raid = deps.requireRaid(raidId);
  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }
  if (!applyFailureToRaid(raid, providerId, reason)) {
    return;
  }

  deps.clearProviderTimers(raidId, providerId);
  deps.applyProviderRoutingCooldown(providerId);
  if (raid.parentRaidId) {
    deps.refreshRaidAncestry(raid.parentRaidId);
    deps.maybeFinalizeAfterUpdate(raid.parentRaidId);
  }
  promoteReserve(raidId, deps);
  deps.maybeFinalizeAfterUpdate(raidId);
  deps.queuePersistBestEffort();
}

export function promoteReserve(raidId: string, deps: RaidProviderDispatchDeps): void {
  const raid = deps.requireRaid(raidId);
  const nextReserveId = promoteReserveProvider(raid);
  if (!nextReserveId) {
    return;
  }
  if (raid.routingProof) {
    raid.routingProof.providers = raid.routingProof.providers.map((decision) =>
      decision.providerId !== nextReserveId || decision.phase !== 'reserve'
        ? decision
        : {
            ...decision,
            phase: 'primary',
            reasons: decision.reasons.includes('promoted_from_reserve')
              ? decision.reasons.filter((reason) => reason !== 'reserved_fallback')
              : [
                  ...decision.reasons.filter((reason) => reason !== 'reserved_fallback'),
                  'promoted_from_reserve',
                ],
          }
    );
  }
  deps.queuePersistBestEffort();
  void dispatchProvider(raidId, nextReserveId, deps);
}
