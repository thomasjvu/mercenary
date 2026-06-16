import assert from 'node:assert/strict';
import test from 'node:test';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { ProviderProfile } from '@bossraid/shared-types';
import {
  MARKETPLACE_REFERENCE_INPUT_TOKENS,
  MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
  buildInferenceMarkets,
  estimateTokenMeteredMarketRateUsd,
  mergeInferenceCatalogMarkets,
  readProviderMarketRateUsd,
} from './inference-marketplace.js';

test('estimateTokenMeteredMarketRateUsd uses reference tokens and honors minimum charge', () => {
  const atMinimum = estimateTokenMeteredMarketRateUsd({
    pricePer1mInputTokensUsd: 0.1,
    pricePer1mOutputTokensUsd: 0.2,
    minimumChargeUsd: 0.03,
  });
  assert.equal(atMinimum, 0.03);

  const aboveMinimum = estimateTokenMeteredMarketRateUsd({
    pricePer1mInputTokensUsd: 5,
    pricePer1mOutputTokensUsd: 10,
    minimumChargeUsd: 0.001,
  });
  const expected =
    (MARKETPLACE_REFERENCE_INPUT_TOKENS / 1_000_000) * 5 +
    (MARKETPLACE_REFERENCE_OUTPUT_TOKENS / 1_000_000) * 10;
  assert.equal(aboveMinimum, expected);
});

test('readProviderMarketRateUsd keeps task pricing and resolves token-metered reference rates', () => {
  const taskProvider = {
    pricePerTaskUsd: 0.42,
    pricing: {
      mode: 'task',
      currency: 'USD',
      pricePerTaskUsd: 0.42,
    },
  } as ProviderProfile;
  assert.equal(readProviderMarketRateUsd(taskProvider), 0.42);

  const tokenProvider = {
    pricePerTaskUsd: 9.99,
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: 5,
      pricePer1mOutputTokensUsd: 10,
      minimumChargeUsd: 0.001,
    },
  } as ProviderProfile;
  assert.equal(
    readProviderMarketRateUsd(tokenProvider),
    estimateTokenMeteredMarketRateUsd(tokenProvider.pricing!)
  );
});

test('mergeInferenceCatalogMarkets applies catalog base prices to live markets', () => {
  const catalogEntry = INFERENCE_MODEL_CATALOG[0];
  const provider = {
    providerId: 'seller-a',
    displayName: 'Seller A',
    modelId: catalogEntry.modelId,
    modelProvider: catalogEntry.modelProvider,
    status: 'available',
    marketplaceOfferStatus: 'active',
    pricePerTaskUsd: 0.05,
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: 0.01,
      pricePer1mOutputTokensUsd: 0.02,
      minimumChargeUsd: 0.001,
    },
    reputation: { totalSuccessfulRaids: 1, totalRaids: 1, p50LatencyMs: 100, p95LatencyMs: 200 },
    maxConcurrency: 1,
  } as ProviderProfile;

  const [liveMarket] = buildInferenceMarkets([provider]);
  assert.equal(liveMarket.pricing.pricePer1mInputTokensUsd, null);
  assert.equal(liveMarket.pricing.pricePer1mOutputTokensUsd, null);

  const [mergedMarket] = mergeInferenceCatalogMarkets([liveMarket]);
  assert.equal(mergedMarket.pricing.pricePer1mInputTokensUsd, catalogEntry.inputPer1mUsd);
  assert.equal(mergedMarket.pricing.pricePer1mOutputTokensUsd, catalogEntry.outputPer1mUsd);
  assert.ok((mergedMarket.cheapestRateUsd ?? 0) < catalogEntry.inputPer1mUsd);
});
