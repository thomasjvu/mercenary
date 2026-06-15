export type FeaturedMarketModel = {
  modelId: string;
  label: string;
};

export const FEATURED_MARKET_MODELS: readonly FeaturedMarketModel[] = [
  { modelId: 'claude-opus-4-8', label: 'Opus 4.8' },
  { modelId: 'claude-fable-5', label: 'Fable 5' },
  { modelId: 'openai-gpt-55', label: 'GPT-5.5' },
  { modelId: 'google-gemma-4-31b-it', label: 'Gemma 4 31B' },
] as const;
