export const openAiModelListSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    object: { type: 'string', enum: ['list'] },
    benchmark: { type: 'object', additionalProperties: true },
    data: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
  required: ['object', 'data'],
} as const;

export const marketplaceStatsSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    activeOffers: {
      type: 'integer',
      description: 'Available active offers with a recognized inference model.',
    },
    sellerOffersActive: {
      type: 'integer',
      description: 'Provider profiles declaring an active offer, including unavailable profiles.',
    },
    modelsLive: {
      type: 'integer',
      description: 'Distinct models with at least one available active offer.',
    },
    routedRequests24h: {
      type: 'integer',
      description:
        'Distinct raid IDs in the last 24 hours among the latest 10,000 seller payout rows for currently registered providers; a multi-provider raid counts once.',
    },
    earnedBySellers24hUsd: {
      type: 'number',
      description:
        'Sum of seller payout ledger rows in the last 24 hours for currently registered providers, based on the latest 10,000 rows rather than chain indexing.',
    },
  },
} as const;
