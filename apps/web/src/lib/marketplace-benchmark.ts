import type { InferenceMarket } from '../api/marketplace.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  estimateBenchmarkPriceUsd,
  estimateBenchmarkTaskUsd,
} from '@bossraid/constants';

export {
  computeSavingsPercent,
  computeSavingsUsd,
  estimateBenchmarkTaskUsd,
} from '@bossraid/constants';

export function normalizeBenchmarkModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const slashIndex = trimmed.lastIndexOf('/');
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

export function resolveBenchmarkTaskUsd(input: {
  modelId: string;
  pricing?: InferenceMarket['pricing'];
  upstreamModelId?: string | null;
}): number | undefined {
  const candidateIds = [
    input.modelId,
    normalizeBenchmarkModelId(input.modelId),
    input.upstreamModelId ?? undefined,
    input.upstreamModelId ? normalizeBenchmarkModelId(input.upstreamModelId) : undefined,
  ].filter((value, index, values): value is string => {
    return typeof value === 'string' && value.length > 0 && values.indexOf(value) === index;
  });

  for (const candidateId of candidateIds) {
    const benchmark = estimateBenchmarkTaskUsd(candidateId);
    if (benchmark != null) {
      return benchmark;
    }
  }

  if (input.pricing) {
    const tokenBenchmark = estimateBenchmarkPriceUsd({
      modelId: normalizeBenchmarkModelId(input.modelId),
      inputTokens: input.pricing.referenceInputTokens ?? undefined,
      outputTokens: input.pricing.referenceOutputTokens ?? undefined,
    });
    if (tokenBenchmark != null && tokenBenchmark > 0) {
      return tokenBenchmark;
    }
  }

  return undefined;
}

export function resolveMarketBenchmarkTaskUsd(market: InferenceMarket): number | undefined {
  const upstreamModelId = market.sellers.find((seller) => seller.pricing.upstreamModelId?.trim())
    ?.pricing.upstreamModelId;

  return resolveBenchmarkTaskUsd({
    modelId: market.modelId,
    pricing: market.pricing,
    upstreamModelId,
  });
}
