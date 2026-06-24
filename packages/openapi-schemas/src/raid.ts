export const spawnRaidBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    task: {
      type: 'object',
      additionalProperties: true,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        language: { type: 'string' },
        framework: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              sha256: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['title', 'description', 'language'],
    },
    raidPolicy: { type: 'object', additionalProperties: true },
    output: { type: 'object', additionalProperties: true },
    hostContext: { type: 'object', additionalProperties: true },
  },
  required: ['task'],
} as const;

export const raidStatusResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    raidId: { type: 'string' },
    status: { type: 'string' },
    phase: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['raidId', 'status'],
} as const;

export const raidResultResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    raidId: { type: 'string' },
    status: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'object', additionalProperties: true } },
    synthesis: { type: 'object', additionalProperties: true },
    settlement: { type: 'object', additionalProperties: true },
  },
  required: ['raidId', 'status'],
} as const;
