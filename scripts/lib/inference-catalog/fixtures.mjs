export const FEATURED_LIVE_MODEL_IDS = new Set([
  'phala/gemma-4-26b-a4b-uncensored',
  'venice-uncensored-1-2',
  'google-gemma-4-31b-it',
  'mistral-small-3-2-24b-instruct',
  'qwen3-5-9b',
  'deepseek-v3.2',
  'minimax-m27',
  'olafangensan-glm-4.7-flash-heretic',
  'e2ee-gemma-4-26b-a4b-uncensored-p',
  'openai-gpt-55',
  'near/zai-org/GLM-5.1-FP8',
  'tee-qwen3-5-122b-chutes',
  'grok-4.5',
  'grok-4-1-fast-reasoning',
  'glm-4.7',
  'glm-5-turbo',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-5',
  'chutes-deepseek-v3.2-tee',
  'chutes-glm-5.2-tee',
]);

function slugProviderId(modelId) {
  return `market-${modelId
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}`;
}

function estimateReferenceRateUsd(model) {
  const input = (1_000 / 1_000_000) * (model.inputPer1mUsd ?? 0);
  const output = (1_024 / 1_000_000) * (model.outputPer1mUsd ?? 0);
  return Math.max(0.01, Number((input + output).toFixed(4)));
}

export function buildMarketplaceProvider(model, port, spawnWorker) {
  const providerId = slugProviderId(model.modelId);
  const minimumChargeUsd = Math.max(0.01, Number((model.inputPer1mUsd * 0.001).toFixed(4)));

  return {
    spawnWorker,
    providerId,
    displayName: model.displayName,
    endpointType: 'http',
    endpoint: `http://127.0.0.1:${port}`,
    specializations: ['inference', 'text'],
    supportedLanguages: ['text'],
    supportedFrameworks: ['openai_compatible'],
    modelFamily: model.modelProvider,
    modelProvider: model.modelProvider,
    modelId: model.modelId,
    outputTypes: ['text', 'json'],
    agentFramework: 'openai_compatible',
    marketplaceOfferStatus: 'active',
    verification: {
      status: 'verified',
      apiVerified: true,
      frameworkVerified: true,
      modelVerified: true,
      notes: ['catalog-synced inference seller'],
    },
    privacy: {
      teeAttested: Boolean(model.teeAttested),
      e2ee: Boolean(model.e2ee),
      teeVendor: model.attestationVendor ?? model.modelProvider,
      signedOutputs: Boolean(model.signedOutputs ?? true),
      noDataRetention: Boolean(model.noDataRetention ?? model.privacy === 'private'),
    },
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: model.inputPer1mUsd,
      pricePer1mOutputTokensUsd: model.outputPer1mUsd,
      tokenPricing: model.tokenPricing,
      minimumChargeUsd,
      rateCardVersion: 'catalog-v1',
      upstreamModelId: model.upstreamModelId ?? model.modelId,
      maxContextTokens: model.maxContextTokens ?? 128_000,
    },
    pricePerTaskUsd: estimateReferenceRateUsd(model),
    maxConcurrency: 4,
    status: 'available',
    auth: {
      type: 'bearer',
      token: `bossraid-market-${providerId}`,
    },
    reputation: {
      globalScore: 0.84,
      responsivenessScore: 0.86,
      validityScore: 0.83,
      qualityScore: 0.85,
      timeoutRate: 0.04,
      duplicateRate: 0.01,
      specializationScores: { inference: 0.9 },
      p50LatencyMs: 2_400,
      p95LatencyMs: 6_500,
      totalRaids: 48,
      totalSuccessfulRaids: 44,
    },
  };
}
