import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMercenaryChatCompletionPayload,
  DEFAULT_MERCENARY_BUDGET_USD,
} from './mercenary-result.js';

test('buildMercenaryChatCompletionPayload uses mercenary-v1 and raid_policy budget', () => {
  const payload = buildMercenaryChatCompletionPayload('Review this pitch.', 18);

  assert.equal(payload.model, 'mercenary-v1');
  assert.equal(payload.raid_policy.max_total_cost, 18);
  assert.equal(payload.raid_policy.max_agents, 3);
  assert.deepEqual(payload.raid_policy.required_capabilities, ['analysis']);
});

test('buildMercenaryChatCompletionPayload defaults budget to 12 USD', () => {
  const payload = buildMercenaryChatCompletionPayload('Hello Mercenary.');

  assert.equal(payload.raid_policy.max_total_cost, DEFAULT_MERCENARY_BUDGET_USD);
});
