import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSettlementLifecycleLabel } from './settlement.js';

test('buildSettlementLifecycleLabel maps known lifecycle states', () => {
  assert.equal(buildSettlementLifecycleLabel('terminal'), 'terminal');
  assert.equal(buildSettlementLifecycleLabel('partial'), 'partial');
  assert.equal(buildSettlementLifecycleLabel('synthetic'), 'synthetic');
});

test('buildSettlementLifecycleLabel defaults to pending', () => {
  assert.equal(buildSettlementLifecycleLabel(undefined), 'pending');
});
