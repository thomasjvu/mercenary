import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiscountInferenceBuyerErgonomics,
  forceDiscountInferenceChatPolicy,
} from './inference-marketplace-policy.js';

test('applyDiscountInferenceBuyerErgonomics maps provider and max_price_ratio', () => {
  const applied = applyDiscountInferenceBuyerErgonomics({
    model: 'grok-4.5',
    messages: [{ role: 'user', content: 'hi' }],
    provider: 'xai',
    max_price_ratio: 0.5,
  });
  assert.deepEqual(applied.raidPolicy?.allowedModelProviders, ['xai']);
  assert.ok(typeof applied.raidPolicy?.maxTotalCost === 'number');
  assert.ok((applied.raidPolicy?.maxTotalCost as number) > 0);
});

test('forceDiscountInferenceChatPolicy keeps cost_first and provider filter', () => {
  const forced = forceDiscountInferenceChatPolicy(
    {
      model: 'darkbloom/gemma-4-26b',
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'darkbloom',
      max_price_usd: 0.05,
    },
    { defaultMaxTotalCost: 1 }
  );
  assert.equal(forced.raidPolicy?.selectionMode, 'cost_first');
  assert.equal(forced.raidPolicy?.maxAgents, 1);
  assert.deepEqual(forced.raidPolicy?.allowedModelProviders, ['darkbloom']);
  assert.equal(forced.raidPolicy?.maxTotalCost, 0.05);
  assert.deepEqual(forced.raidPolicy?.allowedModelIds, ['darkbloom/gemma-4-26b']);
});

test('provider auto does not set allowedModelProviders', () => {
  const applied = applyDiscountInferenceBuyerErgonomics({
    model: 'grok-4.5',
    messages: [{ role: 'user', content: 'hi' }],
    provider: 'auto',
  });
  assert.equal(applied.raidPolicy?.allowedModelProviders, undefined);
});
