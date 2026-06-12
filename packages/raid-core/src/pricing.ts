import type { ProviderPricing, ProviderProfile, RaidTaskSpec } from '@bossraid/shared-types';
import { clamp01, sha256 } from './utils.js';

export function normalizePrice(
  pricePerTaskUsd: number,
  maxBudgetUsd: number,
  numExperts: number
): number {
  const perExpertBudget = maxBudgetUsd / Math.max(numExperts, 1);
  return clamp01(1 - pricePerTaskUsd / Math.max(perExpertBudget, 0.01));
}

export function buildRateCardHash(pricing: Omit<ProviderPricing, 'rateCardHash'>): string {
  return sha256(
    JSON.stringify({
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
    })
  );
}

export function readProviderPricing(provider: ProviderProfile): ProviderPricing {
  if (provider.pricing) {
    return provider.pricing;
  }

  const pricing: Omit<ProviderPricing, 'rateCardHash'> = {
    mode: 'task',
    currency: 'USD',
    pricePerTaskUsd: provider.pricePerTaskUsd,
  };

  return {
    ...pricing,
    rateCardHash: buildRateCardHash(pricing),
  };
}

export function estimateTaskInputTokens(task: RaidTaskSpec): number {
  const text = [
    task.taskTitle,
    task.taskDescription,
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    ...task.failingSignals.errors,
    ...task.files.map((file) => file.content),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTaskOutputTokens(task: RaidTaskSpec): number {
  return Math.max(1, task.constraints.maxOutputTokens ?? 1024);
}

export function estimateTokenMeteredUsd(
  pricing: Pick<
    ProviderPricing,
    'pricePer1mInputTokensUsd' | 'pricePer1mOutputTokensUsd' | 'minimumChargeUsd'
  >,
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost =
    (Math.max(0, inputTokens) / 1_000_000) * Math.max(pricing.pricePer1mInputTokensUsd ?? 0, 0);
  const outputCost =
    (Math.max(0, outputTokens) / 1_000_000) * Math.max(pricing.pricePer1mOutputTokensUsd ?? 0, 0);
  return Math.max(inputCost + outputCost, pricing.minimumChargeUsd ?? 0);
}

export function estimateProviderChargeUsd(provider: ProviderProfile, task: RaidTaskSpec): number {
  const pricing = readProviderPricing(provider);
  if (pricing.mode === 'task') {
    return pricing.pricePerTaskUsd ?? provider.pricePerTaskUsd;
  }

  const inputTokens = task.constraints.maxInputTokens ?? estimateTaskInputTokens(task);
  const outputTokens = estimateTaskOutputTokens(task);
  return estimateTokenMeteredUsd(pricing, inputTokens, outputTokens);
}
