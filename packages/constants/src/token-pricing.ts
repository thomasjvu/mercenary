import type { TokenPricing, TokenRates, TokenUsageDetails } from './token-pricing-types.js';

export function resolveTokenRates(pricing: TokenPricing, inputTokens: number): TokenRates {
  let rates: TokenRates = pricing;
  let threshold = -1;
  for (const tier of pricing.tiers ?? []) {
    if (inputTokens > tier.aboveInputTokens && tier.aboveInputTokens > threshold) {
      rates = tier;
      threshold = tier.aboveInputTokens;
    }
  }
  return rates;
}

/** Tier applies to the whole request once its prompt crosses the threshold. */
export function calculateTokenCostUsd(
  pricing: TokenPricing,
  inputTokens: number,
  outputTokens: number,
  details: TokenUsageDetails = {}
): number {
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);
  const rates = resolveTokenRates(pricing, input);
  let remainingInput = input;
  let remainingOutput = output;
  let cost = 0;
  for (const [tokens, rate] of [
    [details.cacheReadTokens, rates.cache_read],
    [details.cacheWriteTokens, rates.cache_write],
    [details.inputAudioTokens, rates.input_audio],
  ]) {
    const count = Math.min(remainingInput, Math.max(0, tokens ?? 0));
    cost += count * (rate ?? rates.input);
    remainingInput -= count;
  }
  for (const [tokens, rate] of [
    [details.reasoningTokens, rates.reasoning],
    [details.outputAudioTokens, rates.output_audio],
  ]) {
    const count = Math.min(remainingOutput, Math.max(0, tokens ?? 0));
    cost += count * (rate ?? rates.output);
    remainingOutput -= count;
  }
  return (cost + remainingInput * rates.input + remainingOutput * rates.output) / 1_000_000;
}

export function discountTokenPricing(pricing: TokenPricing, multiplier: number): TokenPricing {
  const discount = (rates: TokenRates): TokenRates =>
    Object.fromEntries(
      Object.entries(rates)
        .filter(
          ([key, value]) =>
            key !== 'aboveInputTokens' && key !== 'tiers' && typeof value === 'number'
        )
        .map(([key, value]) => [key, Number((Number(value) * multiplier).toFixed(8))])
    ) as TokenRates;
  return {
    ...discount(pricing),
    tiers: pricing.tiers?.map((tier) => ({
      ...discount(tier),
      aboveInputTokens: tier.aboveInputTokens,
    })),
  };
}
