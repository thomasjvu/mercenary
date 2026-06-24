export const authNonceBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    wallet: { type: 'string', description: 'Optional wallet address to bind the nonce.' },
  },
} as const;

export const authNonceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nonce: { type: 'string' },
    message: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
  required: ['nonce', 'message', 'expiresAt'],
} as const;

export const authVerifyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
    signature: { type: 'string' },
  },
  required: ['message', 'signature'],
} as const;

export const authVerifyResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    authenticated: { type: 'boolean' },
    wallet: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' },
    account: { type: 'object', additionalProperties: true },
  },
  required: ['authenticated', 'wallet', 'expiresAt'],
} as const;

export const sessionResponseSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    authenticated: { type: 'boolean' },
    wallet: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' },
    account: { type: 'object', additionalProperties: true },
  },
  required: ['authenticated'],
} as const;
