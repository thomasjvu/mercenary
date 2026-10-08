/** USD per million tokens. Specialized token counts are subsets of input/output totals. */
export type TokenRates = {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
  reasoning?: number;
  input_audio?: number;
  output_audio?: number;
};
export type TokenPriceTier = TokenRates & { aboveInputTokens: number };
export type TokenPricing = TokenRates & { tiers?: TokenPriceTier[] };
export type TokenUsageDetails = {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
};
export type InferenceTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  details?: TokenUsageDetails;
};
