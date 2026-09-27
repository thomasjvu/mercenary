import type { UpstreamProviderId } from './upstream-providers.js';

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

export type InferenceCatalogEntry = {
  modelId: string;
  displayName: string;
  modelProvider: UpstreamProviderId;
  attestationVendor: UpstreamProviderId;
  upstreamModelId: string;
  upstreamAliases?: string[];
  canonicalModelId?: string;
  inputPer1mUsd: number;
  outputPer1mUsd: number;
  tokenPricing?: TokenPricing;
  maxContextTokens: number;
  maxOutputTokens?: number;
  capabilities?: {
    inputModalities: string[];
    outputModalities: string[];
    toolCall: boolean;
    reasoning: boolean;
    temperature?: boolean;
    structuredOutput: boolean;
  };
  privacy: string;
  teeAttested: boolean;
  e2ee: boolean;
  source?: {
    metadata: 'models.dev' | 'provider';
    metadataUrl?: string;
    pricing: 'models.dev' | 'provider' | 'override';
    pricingUrl: string;
    fetchedAt: string;
    updatedAt?: string;
  };
};
