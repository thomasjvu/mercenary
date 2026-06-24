export const apiErrorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['error', 'message'],
} as const;

export const raidIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    raidId: { type: 'string', description: 'Raid identifier.' },
  },
  required: ['raidId'],
} as const;
