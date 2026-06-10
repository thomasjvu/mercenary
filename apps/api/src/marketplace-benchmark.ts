const MODEL_BENCHMARK_TASK_USD: Record<string, number> = {
  'gpt-5.5': 2.5,
  'gpt-4.1': 2.0,
  'claude-opus-4.8': 4.0,
  'claude-sonnet-4.6': 1.5,
  'gemma-4-31b-it': 0.75,
  'gemma-3-27b-it': 0.5,
};

const MODEL_BENCHMARK_INPUT_PER_1M_USD: Record<string, number> = {
  'gpt-5.5': 2.5,
  'gemma-4-31b-it': 0.35,
};

const MODEL_BENCHMARK_OUTPUT_PER_1M_USD: Record<string, number> = {
  'gpt-5.5': 10,
  'gemma-4-31b-it': 0.55,
};

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
  const inputRate = MODEL_BENCHMARK_INPUT_PER_1M_USD[modelId];
  const outputRate = MODEL_BENCHMARK_OUTPUT_PER_1M_USD[modelId];
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

  return MODEL_BENCHMARK_TASK_USD[modelId];
}

export function computeSavingsUsd(
  benchmarkPriceUsd: number | undefined,
  paidPriceUsd: number
): number | undefined {
  if (benchmarkPriceUsd == null || !Number.isFinite(benchmarkPriceUsd)) {
    return undefined;
  }
  return Math.max(0, benchmarkPriceUsd - paidPriceUsd);
}
