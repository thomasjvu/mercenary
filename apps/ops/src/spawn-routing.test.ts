import assert from 'node:assert/strict';
import test from 'node:test';
import { readSpawnPolicySummary, resolveOpsSpawnRoute } from './lib/spawn-routing.js';

test('resolveOpsSpawnRoute always uses the public raid route', () => {
  const decision = resolveOpsSpawnRoute();
  assert.equal(decision.route, 'public');
  assert.match(decision.reason, /POST \/v1\/raid/);
});

test('readSpawnPolicySummary extracts raid policy fields', () => {
  const summary = readSpawnPolicySummary({
    raidPolicy: {
      maxAgents: 3,
      maxTotalCost: 20,
    },
  });

  assert.equal(summary.maxAgents, 3);
  assert.equal(summary.maxTotalCost, 20);
});
