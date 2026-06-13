import { annotateRoutingProof, buildRoutingProof } from '@bossraid/raid-core';
import type {
  BossRaidRoutingProof,
  BossRaidStatusOutput,
  ProviderProfile,
  RaidRecord,
  SelectedProviders,
} from '@bossraid/shared-types';
import {
  TERMINAL_RAID_STATUSES,
  buildAdaptivePlanningOutput,
  buildRaidStatusOutput,
  refreshRaidRankings,
} from './raid-state.js';

export type RaidLookup = (raidId: string) => RaidRecord;
export type ProviderLookup = (providerId: string) => ProviderProfile | undefined;

export function collectLeafRaids(raid: RaidRecord, getRaid: RaidLookup): RaidRecord[] {
  if (!raid.childRaidIds?.length) {
    return [raid];
  }

  return raid.childRaidIds.flatMap((childRaidId) =>
    collectLeafRaids(getRaid(childRaidId), getRaid)
  );
}

export function refreshParentRaidFromChildren(raidId: string, getRaid: RaidLookup): void {
  const raid = getRaid(raidId);
  if (!raid.childRaidIds?.length) {
    return;
  }

  const childRaids = raid.childRaidIds.map((childRaidId) => {
    const childRaid = getRaid(childRaidId);
    if (childRaid.childRaidIds?.length) {
      refreshParentRaidFromChildren(childRaidId, getRaid);
    }
    return childRaid;
  });
  const rankedSubmissions = childRaids.flatMap((childRaid) => childRaid.rankedSubmissions);
  const firstValidSubmission = rankedSubmissions.find((entry) => entry.breakdown.valid);

  refreshRaidRankings(raid, rankedSubmissions);
  raid.primarySubmissionId = firstValidSubmission?.submission.providerId;
  raid.firstValidSubmissionId = firstValidSubmission?.submission.providerId;
  raid.updatedAt = new Date().toISOString();

  if (TERMINAL_RAID_STATUSES.has(raid.status)) {
    return;
  }

  const hasDispatchingChild = childRaids.some((childRaid) =>
    ['sanitizing', 'queued', 'dispatching'].includes(childRaid.status)
  );
  const hasRunningChild = childRaids.some((childRaid) =>
    ['running', 'first_valid', 'evaluating'].includes(childRaid.status)
  );

  if (firstValidSubmission) {
    raid.status = 'first_valid';
    return;
  }

  raid.status = hasRunningChild ? 'running' : hasDispatchingChild ? 'dispatching' : raid.status;
}

export function buildRaidRoutingProofOutput(
  raid: RaidRecord,
  getRaid: RaidLookup,
  getProvider: ProviderLookup
): BossRaidRoutingProof | undefined {
  if (raid.childRaidIds?.length) {
    const providers = collectLeafRaids(raid, getRaid).flatMap(
      (childRaid) => buildRaidRoutingProofOutput(childRaid, getRaid, getProvider)?.providers ?? []
    );

    if (providers.length === 0) {
      return undefined;
    }

    return {
      policy:
        raid.routingProof?.policy ??
        buildRoutingProof(raid.task, { primaries: [], reserves: [] }).policy,
      providers,
    };
  }

  if (raid.routingProof) {
    return raid.contributionPlan
      ? annotateRoutingProof(raid.routingProof, raid.contributionPlan)
      : raid.routingProof;
  }

  const selectedProviders: SelectedProviders = {
    primaries: raid.selectedProviders
      .map((providerId) => getProvider(providerId))
      .filter((provider): provider is ProviderProfile => provider != null),
    reserves: raid.reserveProviders
      .map((providerId) => getProvider(providerId))
      .filter((provider): provider is ProviderProfile => provider != null),
  };

  if (selectedProviders.primaries.length === 0 && selectedProviders.reserves.length === 0) {
    return undefined;
  }

  const derived = buildRoutingProof(raid.task, selectedProviders);
  return raid.contributionPlan ? annotateRoutingProof(derived, raid.contributionPlan) : derived;
}

export function buildHierarchicalRaidStatusOutput(
  raid: RaidRecord,
  getRaid: RaidLookup
): BossRaidStatusOutput {
  const now = Date.now();
  const childRaids = collectLeafRaids(raid, getRaid);

  return {
    raidId: raid.id,
    status: raid.status,
    experts: childRaids.flatMap((childRaid) =>
      Object.values(childRaid.assignments).map((assignment) => ({
        providerId: assignment.providerId,
        status: assignment.status,
        latencyMs: assignment.latencyMs,
        heartbeatAgeMs: assignment.lastHeartbeatAt
          ? now - Date.parse(assignment.lastHeartbeatAt)
          : undefined,
        progress: assignment.progress,
        message: childRaid.contributionPlan?.workstreamLabel
          ? `${childRaid.contributionPlan.workstreamLabel}: ${assignment.message ?? assignment.status}`
          : assignment.message,
      }))
    ),
    firstValidAvailable: Boolean(raid.firstValidSubmissionId),
    bestCurrentScore: raid.bestCurrentScore,
    adaptivePlanning: buildAdaptivePlanningOutput(raid),
    sanitization: raid.task.sanitizationReport,
  };
}

export function getRaidStatusOutput(raid: RaidRecord, getRaid: RaidLookup): BossRaidStatusOutput {
  if (raid.childRaidIds?.length) {
    refreshParentRaidFromChildren(raid.id, getRaid);
    return buildHierarchicalRaidStatusOutput(raid, getRaid);
  }
  return buildRaidStatusOutput(raid);
}
