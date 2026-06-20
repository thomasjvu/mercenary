import { consumeEphemeralRateLimit } from './ephemeral-rate-limits.js';

export function consumeRateLimit(
  _ctx: unknown,
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  return consumeEphemeralRateLimit(bucket, key, maxRequests, windowMs, nowMs);
}
