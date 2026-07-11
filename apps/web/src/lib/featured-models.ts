export type FeaturedMarketModel = {
  modelId: string;
  label: string;
};

export const FEATURED_MARKET_MODELS: readonly FeaturedMarketModel[] = [
  { modelId: 'anthropic/claude-opus-4-5', label: 'Opus 4.5' },
  { modelId: 'anthropic/claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { modelId: 'openai-gpt-55', label: 'GPT-5.5' },
  { modelId: 'google-gemma-4-31b-it', label: 'Gemma 4 31B' },
] as const;
