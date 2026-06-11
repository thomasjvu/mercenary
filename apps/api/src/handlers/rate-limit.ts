import { type FastifyReply, type FastifyRequest } from 'fastify';
import { readClientRateLimitKey } from '../lib/http.js';
import { type ApiContext } from '../api-context.js';

export function createRateLimitHandlers(ctx: ApiContext) {
  function consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: true } | { allowed: false; retryAfterSec: number } {
    return ctx.controlState.consumeRateLimit(bucket, key, maxRequests, windowMs);
  }

  function requireRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    bucket: string,
    maxRequests: number,
    windowMs: number
  ): { error: string; message: string } | undefined {
    if (maxRequests <= 0) {
      return undefined;
    }

    const result = consumeRateLimit(bucket, readClientRateLimitKey(request), maxRequests, windowMs);
    if (result.allowed) {
      return undefined;
    }

    reply.code(429).header('retry-after', String(result.retryAfterSec));
    return {
      error: 'rate_limited',
      message: 'Too many requests. Retry later.',
    };
  }

  function requireBuyerApiKeyRateLimit(
    auth:
      | {
          type: 'api_key';
          wallet: string;
          apiKeyId: string;
          spendLimitUsd?: number;
          spentUsd: number;
        }
      | { type: 'session'; wallet: string; token: string }
      | undefined,
    reply: FastifyReply
  ): { error: string; message: string } | undefined {
    if (auth?.type !== 'api_key' || ctx.buyerKeyRateLimitMax <= 0) {
      return undefined;
    }

    const result = consumeRateLimit(
      'buyer-api-key',
      auth.apiKeyId,
      ctx.buyerKeyRateLimitMax,
      ctx.buyerKeyRateLimitWindowMs
    );
    if (result.allowed) {
      return undefined;
    }

    reply.code(429).header('retry-after', String(result.retryAfterSec));
    return {
      error: 'rate_limited',
      message: 'API key rate limit exceeded. Retry later.',
    };
  }

  return {
    requireRateLimit,
    requireBuyerApiKeyRateLimit,
  };
}
