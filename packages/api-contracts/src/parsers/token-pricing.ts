import type { TokenPricing, TokenRates } from '@bossraid/constants';
import { ApiContractError, ensureRecord, ensureFiniteNumberLike } from '../validation.js';

export function parseTokenPricing(value: unknown): TokenPricing | undefined {
  if (value == null) return undefined;
  const input = ensureRecord(value, 'pricing.tokenPricing');
  const parseRates = (value: Record<string, unknown>): TokenRates => {
    const rates: Record<string, number> = {};
    for (const key of [
      'input',
      'output',
      'cache_read',
      'cache_write',
      'reasoning',
      'input_audio',
      'output_audio',
    ]) {
      if (key !== 'input' && key !== 'output' && value[key] == null) continue;
      const rate = ensureFiniteNumberLike(value[key], `pricing.tokenPricing.${key}`);
      if (rate < 0) throw new ApiContractError('Token prices cannot be negative.');
      rates[key] = rate;
    }
    return rates as TokenRates;
  };
  const rates = parseRates(input);
  if (input.tiers == null) return rates;
  if (!Array.isArray(input.tiers) || input.tiers.length > 32)
    throw new ApiContractError('Expected at most 32 context pricing tiers.');
  let previous = -1;
  const tiers = input.tiers.map((value: unknown) => {
    const tier = ensureRecord(value, 'pricing.tokenPricing.tiers');
    const aboveInputTokens = ensureFiniteNumberLike(
      tier.aboveInputTokens,
      'pricing.tokenPricing.tiers.aboveInputTokens'
    );
    if (!Number.isSafeInteger(aboveInputTokens) || aboveInputTokens <= previous)
      throw new ApiContractError('Context thresholds must be nonnegative, unique, and increasing.');
    previous = aboveInputTokens;
    return { ...parseRates(tier), aboveInputTokens };
  });
  return { ...rates, tiers };
}
