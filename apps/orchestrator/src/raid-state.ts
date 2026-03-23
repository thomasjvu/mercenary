import { rankSubmissions } from "@bossraid/raid-core";
import type {
  BossRaidAdaptivePlanningOutput,
  BossRaidStatusOutput,
  EvaluationBreakdown,
  ProviderHeartbeat,
  ProviderSubmission,
  RaidRecord,
  RankedSubmission,
} from "@bossraid/shared-types";
import { buildSynthesizedOutput } from "./synthesis.js";

export const TERMINAL_ASSIGNMENT_STATUSES = new Set([
  "submitted",
  "invalid",
  "timed_out",
  "failed",
  "disqualified",
]);

export const TERMINAL_RAID_STATUSES = new Set([
  "final",
  "cancelled",
  "expired",
]);

export function restorePersistedRaid(raid: RaidRecord): RaidRecord {
  const restored = structuredClone(raid) as RaidRecord;
  if (!["final", "cancelled", "expired"].includes(restored.status)) {
    restored.status = "expired";
    restored.updatedAt = new Date().toISOString();
    for (const assignment of Object.values(restored.assignments)) {
      if (!TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        assignment.status = "failed";
        assignment.message = "restored from persistence without active runtime";
      }
    }
  }
  restored.synthesizedOutput ??= buildSynthesizedOutput(restored);
  return restored;
}

export function buildRaidStatusOutput(raid: RaidRecord): BossRaidStatusOutput {
  const now = Date.now();
  return {
    raidId: raid.id,
    status: raid.status,
    experts: Object.values(raid.assignments).map((assignment) => ({
      providerId: assignment.providerId,
      status: assignment.status,
      latencyMs: assignment.latencyMs,
      heartbeatAgeMs: assignment.lastHeartbeatAt ? now - Date.parse(assignment.lastHeartbeatAt) : undefined,
      progress: assignment.progress,
      message: assignment.message,
    })),
    firstValidAvailable: Boolean(raid.firstValidSubmissionId),
    bestCurrentScore: raid.bestCurrentScore,
    adaptivePlanning: buildAdaptivePlanningOutput(raid),
    sanitization: raid.task.sanitizationReport,
  };
}

export function buildAdaptivePlanningOutput(
  raid: RaidRecord,
): BossRaidAdaptivePlanningOutput | undefined {
  if (!raid.adaptivePlanning) {
    return undefined;
  }

  return {
    plannedReserveExperts: raid.adaptivePlanning.plannedReserveExperts,
    remainingReserveExperts: raid.adaptivePlanning.availableProviderIds.length,
    revisionCount: raid.adaptivePlanning.revisionCount,
    maxRevisions: raid.adaptivePlanning.maxRevisions,
    history: raid.adaptivePlanning.history,
  };
}

export function applyHeartbeatToRaid(
  raid: RaidRecord,
  providerId: string,
  heartbeat: ProviderHeartbeat,
): boolean {
  const assignment = raid.assignments[providerId];
  if (!assignment) {
    return false;
  }
  if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return false;
  }

  const now = heartbeat.timestamp;
  assignment.status = "running";
  assignment.progress = heartbeat.progress;
  assignment.message = heartbeat.message;
  assignment.lastHeartbeatAt = now;
  assignment.firstHeartbeatAt ??= now;
  assignment.latencyMs = Math.max(Date.parse(now) - Date.parse(raid.createdAt), 0);
  raid.updatedAt = now;
  return true;
}

export function applySubmissionToRaid(
  raid: RaidRecord,
  submission: ProviderSubmission,
  breakdown: EvaluationBreakdown,
): RankedSubmission {
  const assignment = raid.assignments[submission.providerId];
  if (!assignment) {
    throw new Error(`Unknown provider assignment: ${submission.providerId}`);
  }
  assignment.status = breakdown.valid ? "submitted" : "invalid";
  assignment.submittedAt = submission.submittedAt;
  assignment.message = breakdown.summary;
  assignment.progress = 1;
  assignment.latencyMs = Math.max(Date.parse(submission.submittedAt) - Date.parse(raid.createdAt), 0);

  const next: RankedSubmission = {
    submission,
    breakdown,
    rank: raid.rankedSubmissions.length + 1,
  };

  raid.rankedSubmissions = rankSubmissions([...raid.rankedSubmissions, next]);
  raid.bestCurrentScore = raid.rankedSubmissions[0]?.breakdown.finalScore;
  raid.synthesizedOutput = buildSynthesizedOutput(raid);
  raid.updatedAt = new Date().toISOString();

  if (!raid.firstValidSubmissionId && breakdown.valid) {
    raid.firstValidSubmissionId = submission.providerId;
    raid.status = "first_valid";
  }

  return raid.rankedSubmissions.find((item) => item.submission.providerId === submission.providerId)!;
}

export function applyTimeoutToRaid(
  raid: RaidRecord,
  providerId: string,
  reason: string,
): boolean {
  const assignment = raid.assignments[providerId];
  if (!assignment) {
    return false;
  }
  if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return false;
  }

  assignment.status = "timed_out";
  assignment.timeoutAt = new Date().toISOString();
  assignment.message = reason;
  assignment.progress = assignment.progress ?? 0;
  raid.updatedAt = assignment.timeoutAt;
  return true;
}

export function applyFailureToRaid(
  raid: RaidRecord,
  providerId: string,
  reason: string,
): boolean {
  const assignment = raid.assignments[providerId];
  if (!assignment) {
    return false;
  }
  if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return false;
  }

  assignment.status = "failed";
  assignment.message = reason;
  assignment.timeoutAt = new Date().toISOString();
  raid.updatedAt = assignment.timeoutAt;
  return true;
}

export function applyDisqualificationToRaid(
  raid: RaidRecord,
  providerId: string,
  reason: string,
): boolean {
  const assignment = raid.assignments[providerId];
  if (!assignment) {
    return false;
  }
  if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
    return false;
  }

  assignment.status = "disqualified";
  assignment.message = reason;
  assignment.timeoutAt = new Date().toISOString();
  assignment.progress = assignment.progress ?? 0;
  raid.updatedAt = assignment.timeoutAt;
  return true;
}

export function promoteReserveProvider(raid: RaidRecord): string | undefined {
  const nextReserveId = raid.reserveProviders.find((providerId) => !raid.selectedProviders.includes(providerId));
  if (!nextReserveId) {
    return undefined;
  }

  raid.selectedProviders.push(nextReserveId);
  raid.assignments[nextReserveId].message = "promoted from reserve";
  raid.updatedAt = new Date().toISOString();
  return nextReserveId;
}

export function shouldFinalizeRaid(raid: RaidRecord): boolean {
  return raid.selectedProviders.every((providerId) =>
    TERMINAL_ASSIGNMENT_STATUSES.has(raid.assignments[providerId]?.status),
  );
}

export function finalizeRaidRecord(raid: RaidRecord): void {
  raid.rankedSubmissions = rankSubmissions(raid.rankedSubmissions);
  raid.primarySubmissionId = raid.rankedSubmissions.find((item) => item.breakdown.valid)?.submission.providerId;
  raid.synthesizedOutput = buildSynthesizedOutput(raid);
  raid.bestCurrentScore = raid.rankedSubmissions[0]?.breakdown.finalScore;
  raid.status = "final";
  raid.updatedAt = new Date().toISOString();
}
