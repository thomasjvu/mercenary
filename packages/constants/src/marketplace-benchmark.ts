import {
  CATALOG_BENCHMARK_INPUT_PER_1M_USD,
  CATALOG_BENCHMARK_OUTPUT_PER_1M_USD,
  CATALOG_BENCHMARK_TASK_USD,
} from './inference-catalog-benchmark.js';

export const MODEL_BENCHMARK_TASK_USD: Record<string, number> = {
  'gpt-5.5': 2.5,
  'gpt-4.1': 2.0,
  'claude-opus-4.8': 4.0,
  'claude-sonnet-4.6': 1.5,
  'claude-opus-4.1': 3.5,
  'gemma-4-31b-it': 0.75,
  'gemma-3-27b-it': 0.5,
};

export const MODEL_BENCHMARK_INPUT_PER_1M_USD: Record<string, number> = {
  'gpt-5.5': 2.5,
  'gemma-4-31b-it': 0.35,
};

export const MODEL_BENCHMARK_OUTPUT_PER_1M_USD: Record<string, number> = {
  'gpt-5.5': 10,
  'gemma-4-31b-it': 0.55,
};

export function normalizeBenchmarkModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const slashIndex = trimmed.lastIndexOf('/');
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

export function estimateBenchmarkTaskUsd(modelId: string): number | undefined {
  const key = modelId.trim();
  const normalized = normalizeBenchmarkModelId(key);
  return (
    MODEL_BENCHMARK_TASK_USD[key] ??
    MODEL_BENCHMARK_TASK_USD[normalized] ??
    CATALOG_BENCHMARK_TASK_USD[key] ??
    CATALOG_BENCHMARK_TASK_USD[normalized]
  );
}

export function estimateBenchmarkPriceUsd(input: {
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  flatTaskUsd?: number;
}): number | undefined {
  const modelId = input.modelId?.trim();
  if (!modelId) {
    return undefined;
  }

  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);
  const inputRate =
    MODEL_BENCHMARK_INPUT_PER_1M_USD[modelId] ?? CATALOG_BENCHMARK_INPUT_PER_1M_USD[modelId];
  const outputRate =
    MODEL_BENCHMARK_OUTPUT_PER_1M_USD[modelId] ?? CATALOG_BENCHMARK_OUTPUT_PER_1M_USD[modelId];
  if (inputRate != null || outputRate != null) {
    const tokenBenchmark =
      (inputTokens / 1_000_000) * (inputRate ?? 0) + (outputTokens / 1_000_000) * (outputRate ?? 0);
    if (tokenBenchmark > 0) {
      return tokenBenchmark;
    }
  }

  if (typeof input.flatTaskUsd === 'number' && input.flatTaskUsd > 0) {
    return input.flatTaskUsd;
  }

  return MODEL_BENCHMARK_TASK_USD[modelId] ?? CATALOG_BENCHMARK_TASK_USD[modelId];
}

export function computeSavingsUsd(
  benchmarkPriceUsd: number | undefined,
  paidPriceUsd: number | null | undefined
): number | undefined {
  if (
    benchmarkPriceUsd == null ||
    paidPriceUsd == null ||
    !Number.isFinite(benchmarkPriceUsd) ||
    !Number.isFinite(paidPriceUsd)
  ) {
    return undefined;
  }

  return Math.max(0, benchmarkPriceUsd - paidPriceUsd);
}

export function computeSavingsPercent(
  benchmarkPriceUsd: number | undefined,
  paidPriceUsd: number | null | undefined
): number | undefined {
  const savings = computeSavingsUsd(benchmarkPriceUsd, paidPriceUsd);
  if (savings == null || benchmarkPriceUsd == null || benchmarkPriceUsd <= 0) {
    return undefined;
  }

  return Math.round((savings / benchmarkPriceUsd) * 100);
}
