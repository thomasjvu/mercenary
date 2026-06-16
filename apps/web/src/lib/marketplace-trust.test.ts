import assert from 'node:assert/strict';
import test from 'node:test';
import type { InferenceMarket } from '../api/marketplace.js';
import { marketMatchesTrustFilter } from './marketplace-trust.js';

function buildMarket(overrides: Partial<InferenceMarket> = {}): InferenceMarket {
  return {
    object: 'inference.market',
    modelId: 'e2ee-gemma-4-31b',
    providerCount: 1,
    activeProviderCount: 1,
    verifiedSellerCount: 0,
    privateSellerCount: 0,
    recentSuccessRate: null,
    p50LatencyMs: null,
    p95LatencyMs: null,
    cheapestRateUsd: 0.01,
    pricing: {
      benchmarkSource: 'models.dev',
      benchmarkUrl: 'https://models.dev/api.json',
      benchmarkMode: 'static_reference_only',
      declaredUnit: 'token_metered',
      cheapestPricePerTaskUsd: 0.01,
      pricePer1mInputTokensUsd: 1,
      pricePer1mOutputTokensUsd: 2,
      referenceInputTokens: 1000,
      referenceOutputTokens: 1024,
    },
    sellers: [],
    ...overrides,
  };
}

test('marketMatchesTrustFilter uses catalog tee and e2ee flags', () => {
  const market = buildMarket();

  assert.equal(marketMatchesTrustFilter(market, 'any'), true);
  assert.equal(marketMatchesTrustFilter(market, 'tee'), true);
  assert.equal(marketMatchesTrustFilter(market, 'e2ee'), true);
  assert.equal(marketMatchesTrustFilter(market, 'private'), false);
});

test('marketMatchesTrustFilter falls back to seller privacy flags', () => {
  const market = buildMarket({
    modelId: 'custom-model',
    sellers: [
      {
        sellerId: 'seller-a',
        displayName: 'Seller A',
        rateUsd: 0.01,
        status: 'available',
        privacy: { teeAttested: true },
        maxConcurrency: 1,
        pricing: {
          unit: 'token_metered',
          pricePerTaskUsd: null,
          pricePer1mInputTokensUsd: 1,
          pricePer1mOutputTokensUsd: 2,
          minimumChargeUsd: 0.01,
          currency: 'USD',
        },
      },
    ],
  });

  assert.equal(marketMatchesTrustFilter(market, 'tee'), true);
  assert.equal(marketMatchesTrustFilter(market, 'e2ee'), false);
});
