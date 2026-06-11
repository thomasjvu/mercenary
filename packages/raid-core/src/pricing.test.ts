import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import {
  buildRateCardHash,
  estimateProviderChargeUsd,
  estimateTaskInputTokens,
  normalizePrice,
  readProviderPricing,
} from './pricing.js';

test('normalizePrice favors cheaper providers within per-expert budget', () => {
  assert.equal(normalizePrice(1, 10, 2), 0.8);
  assert.equal(normalizePrice(5, 10, 2), 0);
});

test('estimateTaskInputTokens counts task text payload', () => {
  const task = createSpawnInput();
  assert.ok(estimateTaskInputTokens(task) > 0);
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

test('buildRateCardHash is stable for equivalent pricing payloads', () => {
  const pricing = readProviderPricing(createProviderProfile('provider-hash'));
  const hashA = buildRateCardHash({
    mode: pricing.mode,
    currency: pricing.currency,
    pricePerTaskUsd: pricing.pricePerTaskUsd,
    pricePer1mInputTokensUsd: pricing.pricePer1mInputTokensUsd,
    pricePer1mOutputTokensUsd: pricing.pricePer1mOutputTokensUsd,
    minimumChargeUsd: pricing.minimumChargeUsd,
    validFrom: pricing.validFrom,
    validUntil: pricing.validUntil,
    rateCardVersion: pricing.rateCardVersion,
    upstreamModelId: pricing.upstreamModelId,
    maxContextTokens: pricing.maxContextTokens,
  });
  const hashB = buildRateCardHash({
    mode: pricing.mode,
    currency: pricing.currency,
    pricePerTaskUsd: pricing.pricePerTaskUsd,
    pricePer1mInputTokensUsd: pricing.pricePer1mInputTokensUsd,
    pricePer1mOutputTokensUsd: pricing.pricePer1mOutputTokensUsd,
    minimumChargeUsd: pricing.minimumChargeUsd,
    validFrom: pricing.validFrom,
    validUntil: pricing.validUntil,
    rateCardVersion: pricing.rateCardVersion,
    upstreamModelId: pricing.upstreamModelId,
    maxContextTokens: pricing.maxContextTokens,
  });

  assert.equal(hashA, hashB);
  assert.equal(pricing.rateCardHash, hashA);
});
