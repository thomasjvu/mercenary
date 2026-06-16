import {
  MARKETPLACE_REFERENCE_INPUT_TOKENS,
  MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
} from '@bossraid/constants';
import { estimateTokenMeteredUsd, readProviderPricing } from '@bossraid/raid-core';
import type { ProviderPricing, ProviderProfile } from '@bossraid/shared-types';

export { MARKETPLACE_REFERENCE_INPUT_TOKENS, MARKETPLACE_REFERENCE_OUTPUT_TOKENS };

export function resolveProviderMarketModelId(provider: ProviderProfile): string | undefined {
  return provider.modelId ?? provider.modelFamily;
}

export function estimateTokenMeteredMarketRateUsd(
  pricing: Pick<
    ProviderPricing,
    'pricePer1mInputTokensUsd' | 'pricePer1mOutputTokensUsd' | 'minimumChargeUsd'
  >,
  referenceInputTokens = MARKETPLACE_REFERENCE_INPUT_TOKENS,
  referenceOutputTokens = MARKETPLACE_REFERENCE_OUTPUT_TOKENS
): number {
  return estimateTokenMeteredUsd(pricing, referenceInputTokens, referenceOutputTokens);
}

export function readProviderMarketRateUsd(provider: ProviderProfile): number {
  const pricing = readProviderPricing(provider);
  if (pricing.mode === 'task') {
    return pricing.pricePerTaskUsd ?? provider.pricePerTaskUsd;
  }
  return estimateTokenMeteredMarketRateUsd(pricing);
}
