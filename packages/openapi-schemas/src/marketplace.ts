export const openAiModelListSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    object: { type: 'string', enum: ['list'] },
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
    activeOffers: { type: 'integer' },
    sellerOffersActive: { type: 'integer' },
    modelsLive: { type: 'integer' },
    routedRequests24h: { type: 'integer' },
    earnedBySellers24hUsd: { type: 'number' },
  },
} as const;
