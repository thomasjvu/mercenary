export const healthResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    providers: { type: 'integer' },
    readyProviders: { type: 'integer' },
    raids: { type: 'integer' },
  },
  required: ['ok', 'providers', 'readyProviders', 'raids'],
} as const;

export const readyResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean' },
    gates: { type: 'object', additionalProperties: true },
    providers: { type: 'integer' },
    readyProviders: { type: 'integer' },
    storage: { type: 'object', additionalProperties: true },
    payment: { type: 'object', additionalProperties: true },
    settlement: { type: 'object', additionalProperties: true },
    limits: { type: 'object', additionalProperties: true },
  },
  required: ['ok', 'gates'],
} as const;
