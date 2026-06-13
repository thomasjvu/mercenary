import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSavingsUsd, estimateBenchmarkPriceUsd } from '@bossraid/constants';

test('estimateBenchmarkPriceUsd returns static reference pricing', () => {
  assert.equal(estimateBenchmarkPriceUsd({ modelId: 'gemma-4-31b-it' }), 0.75);
  assert.equal(
    estimateBenchmarkPriceUsd({
      modelId: 'gemma-4-31b-it',
      inputTokens: 1_000_000,
      outputTokens: 0,
    }),
    0.35
  );
});

test('computeSavingsUsd never returns negative savings', () => {
  assert.equal(computeSavingsUsd(1, 0.25), 0.75);
  assert.equal(computeSavingsUsd(0.1, 0.25), 0);
  assert.equal(computeSavingsUsd(undefined, 0.25), undefined);
});
