import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutingDecisionSummary } from '@bossraid/proof-ui';
import { buildRoutingDecisionSummary as opsRoutingSummary } from './components/ops-ui';

test('ops routing summary re-export matches proof-ui helper', () => {
  const decision = {
    providerId: 'provider-ops',
    phase: 'primary' as const,
    workstreamLabel: 'Answer',
    roleLabel: 'Answer Core',
    veniceBacked: false,
    erc8004Registered: true,
    trustScore: 71,
    reasons: ['selected_primary', 'trust_ranked'],
  };

  assert.equal(opsRoutingSummary(decision), buildRoutingDecisionSummary(decision));
  assert.match(opsRoutingSummary(decision), /primary · Answer \/ Answer Core/);
  assert.match(opsRoutingSummary(decision), /trust 71/);
});
