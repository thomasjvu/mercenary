import type {
  BossRaidReplayOutput,
  BossRaidResultOutput,
  BossRaidStatusOutput,
  RaidRecord,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import {
  buildRaidRoutingProofOutput,
  collectLeafRaids,
  getRaidStatusOutput,
  refreshParentRaidFromChildren,
} from './raid-hierarchy.js';
import { buildAdaptivePlanningOutput } from './raid-state.js';
import { buildSettlementSummary } from './settlement.js';
import { reEvaluateRaidSubmissions } from './raid-state.js';
import { buildSynthesizedOutput } from './synthesis.js';
import type { ProviderRegistryCoordinator } from './orchestrator-provider-registry.js';

export function settlementExecutionEquals(
  left: SettlementExecutionRecord | undefined,
  right: SettlementExecutionRecord | undefined
): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export type RaidLifecycleQueriesContext = {
  raids: Map<string, RaidRecord>;
  requireRaid: (raidId: string) => RaidRecord;
  providerRegistry: ProviderRegistryCoordinator;
  queuePersist: () => Promise<void>;
};

export function listAllRaids(ctx: RaidLifecycleQueriesContext): RaidRecord[] {
  return [...ctx.raids.values()];
}

export function listRaids(ctx: RaidLifecycleQueriesContext): RaidRecord[] {
  return listAllRaids(ctx)
    .filter((raid) => raid.parentRaidId == null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function getRaid(ctx: RaidLifecycleQueriesContext, raidId: string): RaidRecord | undefined {
  return ctx.raids.get(raidId);
}

export async function updateSettlementExecution(
  ctx: RaidLifecycleQueriesContext,
  raidId: string,
  settlementExecution: SettlementExecutionRecord
): Promise<SettlementExecutionRecord | undefined> {
  const raid = ctx.raids.get(raidId);
  if (!raid) {
    return undefined;
  }

  if (settlementExecutionEquals(raid.settlementExecution, settlementExecution)) {
    return raid.settlementExecution;
  }

  raid.settlementExecution = settlementExecution;
  raid.updatedAt = new Date().toISOString();
  await ctx.queuePersist();
  return raid.settlementExecution;
}

export function getStatus(ctx: RaidLifecycleQueriesContext, raidId: string): BossRaidStatusOutput {
  return getRaidStatusOutput(ctx.requireRaid(raidId), (childRaidId) =>
    ctx.requireRaid(childRaidId)
  );
}

export function getResult(ctx: RaidLifecycleQueriesContext, raidId: string): BossRaidResultOutput {
  const raid = ctx.requireRaid(raidId);
  if (raid.childRaidIds?.length) {
    refreshParentRaidFromChildren(raidId, (childRaidId) => ctx.requireRaid(childRaidId));
  }
  const ranked = raid.rankedSubmissions;
  const settlement = buildSettlementSummary(raid);
  const routingProof = buildRaidRoutingProofOutput(
    raid,
    (childRaidId) => ctx.requireRaid(childRaidId),
    (providerId) => ctx.providerRegistry.providers.get(providerId)
  );

  return {
    raidId,
    status: raid.status,
    synthesizedOutput: raid.synthesizedOutput ?? buildSynthesizedOutput(raid),
    adaptivePlanning: buildAdaptivePlanningOutput(raid),
    routingProof,
    primarySubmission: ranked.find((item) => item.breakdown.valid),
    approvedSubmissions: ranked.filter((item) => item.breakdown.valid),
    rankedSubmissions: ranked,
    settlement,
    settlementExecution: raid.settlementExecution,
    reputationEvents: raid.reputationEvents,
  };
}

export async function replayEvaluation(
  ctx: RaidLifecycleQueriesContext & {
    refreshRaidAncestry: (raidId: string | undefined) => void;
  },
  raidId: string
): Promise<BossRaidReplayOutput> {
  const raid = ctx.requireRaid(raidId);
  if (raid.childRaidIds?.length) {
    const leafRaids = collectLeafRaids(raid, (childRaidId) => ctx.requireRaid(childRaidId));
    let reEvaluated = 0;
    for (const leafRaid of leafRaids) {
      reEvaluated += await reEvaluateRaidSubmissions(leafRaid);
    }

    refreshParentRaidFromChildren(raidId, (childRaidId) => ctx.requireRaid(childRaidId));
    ctx.refreshRaidAncestry(raid.parentRaidId);
    await ctx.queuePersist();
    return {
      raidId,
      reEvaluated,
    };
  }

  const reEvaluated = await reEvaluateRaidSubmissions(raid);
  await ctx.queuePersist();
  return {
    raidId,
    reEvaluated,
  };
}
