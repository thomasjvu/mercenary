export const MARKETPLACE_REFERENCE_INPUT_TOKENS = 1_000;
export const MARKETPLACE_REFERENCE_OUTPUT_TOKENS = 1_024;

export const MARKETPLACE_BENCHMARK_SOURCE = 'models.dev' as const;
export const MARKETPLACE_BENCHMARK_URL = 'https://models.dev/api.json' as const;
export const MARKETPLACE_BENCHMARK_MODE = 'static_reference_only' as const;

export const MARKETPLACE_BENCHMARK_PRICING = {
  benchmarkSource: MARKETPLACE_BENCHMARK_SOURCE,
  benchmarkUrl: MARKETPLACE_BENCHMARK_URL,
  benchmarkMode: MARKETPLACE_BENCHMARK_MODE,
} as const;
