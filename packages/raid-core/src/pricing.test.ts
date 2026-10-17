import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import {
  buildRateCardHash,
  estimateProviderChargeUsd,
  estimateTokenMeteredUsd,
  normalizePrice,
} from './pricing.js';

test('normalizePrice favors cheaper providers within per-expert budget', () => {
  assert.equal(normalizePrice(1, 10, 2), 0.8);
  assert.equal(normalizePrice(5, 10, 2), 0);
});

test('estimateProviderChargeUsd uses task pricing when mode is task', () => {
  const provider = createProviderProfile('provider-task-rate', { pricePerTaskUsd: 2.5 });
  const task = createSpawnInput();

  assert.equal(estimateProviderChargeUsd(provider, task), 2.5);
});

test('estimateProviderChargeUsd meters token pricing with minimum charge', () => {
  const provider = createProviderProfile('provider-token-rate', {
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: 1,
      pricePer1mOutputTokensUsd: 2,
      minimumChargeUsd: 0.5,
      rateCardHash: 'token-rate',
    },
  });
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      maxInputTokens: 1_000,
      maxOutputTokens: 500,
    },
  };

  const charge = estimateProviderChargeUsd(provider, task);
  assert.ok(charge >= 0.5);
});

test('estimateTokenMeteredUsd honors reference tokens and minimum charge', () => {
  assert.equal(
    estimateTokenMeteredUsd(
      {
        pricePer1mInputTokensUsd: 1,
        pricePer1mOutputTokensUsd: 2,
        minimumChargeUsd: 0.03,
      },
      1_000,
      1_024
    ),
    0.03
  );
  assert.equal(
    estimateTokenMeteredUsd(
      {
        pricePer1mInputTokensUsd: 1,
        pricePer1mOutputTokensUsd: 2,
        minimumChargeUsd: 0.001,
      },
      1_000,
      1_024
    ),
    0.003048
  );
});

test('context tier changes quotes, specialized usage is not counted twice, and tier changes change the hash', () => {
  const tokenPricing = {
    input: 1,
    output: 2,
    cache_read: 0.1,
    tiers: [{ aboveInputTokens: 200_000, input: 3, output: 6, cache_read: 0.3 }],
  };
  const pricing = { mode: 'token_metered' as const, currency: 'USD' as const, tokenPricing };
  assert.equal(estimateTokenMeteredUsd(pricing, 200_000, 1000), 0.202);
  assert.equal(estimateTokenMeteredUsd(pricing, 200_001, 1000), 0.606003);
  assert.equal(
    estimateTokenMeteredUsd(pricing, 200_001, 1000, { cacheReadTokens: 100_000 }),
    0.336003
  );
  assert.notEqual(
    buildRateCardHash(pricing),
    buildRateCardHash({ ...pricing, tokenPricing: { ...tokenPricing, tiers: [] } })
  );
});
