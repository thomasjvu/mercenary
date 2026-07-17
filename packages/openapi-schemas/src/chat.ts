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
    provider: {
      type: 'string',
      description:
        'Discount inference: auto (default) or upstream id (venice, xai, darkbloom, …) → allowed_model_providers.',
    },
    max_price_usd: {
      type: 'number',
      description: 'Absolute max spend USD for this call (alias of raid_policy.max_total_cost).',
    },
    max_price_ratio: {
      type: 'number',
      description:
        'Cap spend as a fraction of catalog reference task price (0–1). Fail closed if no seller within budget.',
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
