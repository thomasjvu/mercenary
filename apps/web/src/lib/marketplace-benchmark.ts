const MODEL_BENCHMARK_TASK_USD: Record<string, number> = {
  'gpt-5.5': 2.5,
  'gpt-4.1': 2.0,
  'claude-opus-4.8': 4.0,
  'claude-sonnet-4.6': 1.5,
  'claude-opus-4.1': 3.5,
  'gemma-4-31b-it': 0.75,
  'gemma-3-27b-it': 0.5,
};

export function estimateBenchmarkTaskUsd(modelId: string): number | undefined {
  return MODEL_BENCHMARK_TASK_USD[modelId.trim()];
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
