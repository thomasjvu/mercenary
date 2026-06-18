import assert from 'node:assert/strict';
import test from 'node:test';
import type { InferenceMarket } from '../api/marketplace.js';
import {
  normalizeBenchmarkModelId,
  resolveMarketBenchmarkTaskUsd,
} from './marketplace-benchmark.js';

test('normalizeBenchmarkModelId strips provider prefix', () => {
  assert.equal(normalizeBenchmarkModelId('google/gemma-4-31b-it'), 'gemma-4-31b-it');
  assert.equal(normalizeBenchmarkModelId('gpt-5.5'), 'gpt-5.5');
});

test('resolveMarketBenchmarkTaskUsd uses catalog benchmark for known models', () => {
  const market = {
    modelId: 'openai-gpt-55',
    pricing: {
      benchmarkSource: 'models.dev',
      benchmarkUrl: 'https://models.dev/api.json',
      benchmarkMode: 'static_reference_only',
      declaredUnit: 'token_metered',
      cheapestPricePerTaskUsd: 0.01,
      pricePer1mInputTokensUsd: 6.25,
      pricePer1mOutputTokensUsd: 37.5,
      referenceInputTokens: 1000,
      referenceOutputTokens: 1024,
    },
    sellers: [],
  } as unknown as InferenceMarket;

  const benchmark = resolveMarketBenchmarkTaskUsd(market);
  assert.ok(benchmark != null && benchmark > 0);
});
