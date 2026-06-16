export type OpsSpawnRoute = 'public';

export type OpsSpawnRoutingDecision = {
  route: OpsSpawnRoute;
  reason: string;
};

export function resolveOpsSpawnRoute(): OpsSpawnRoutingDecision {
  return {
    route: 'public',
    reason: 'Admin session spawns through POST /v1/raid without buyer payment.',
  };
}

export function readSpawnPolicySummary(payload: unknown): {
  maxAgents: number | null;
  maxTotalCost: number | null;
} {
  if (!payload || typeof payload !== 'object') {
    return { maxAgents: null, maxTotalCost: null };
  }

  const record = payload as {
    raidPolicy?: {
      maxAgents?: unknown;
      maxTotalCost?: unknown;
    };
  };

  const maxAgents =
    typeof record.raidPolicy?.maxAgents === 'number' ? record.raidPolicy.maxAgents : null;
  const maxTotalCost =
    typeof record.raidPolicy?.maxTotalCost === 'number' ? record.raidPolicy.maxTotalCost : null;

  return { maxAgents, maxTotalCost };
}
