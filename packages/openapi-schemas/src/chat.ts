export const chatCompletionBodySchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    model: { type: 'string' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
          content: {},
        },
        required: ['role', 'content'],
      },
    },
    stream: { type: 'boolean' },
    max_tokens: { type: 'integer' },
    temperature: { type: 'number' },
    reasoning_effort: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'xhigh'],
      description:
        'OpenAI-compatible reasoning effort (xAI Grok / Grok Build). Passed through to the selected upstream when supported.',
    },
  },
  required: ['messages'],
} as const;

export const chatCompletionResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    object: { type: 'string' },
    created: { type: 'integer' },
    model: { type: 'string' },
    choices: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    usage: { type: 'object', additionalProperties: true },
  },
  required: ['id', 'object', 'choices'],
} as const;
