import type { ControlStateContext } from './state-context.js';
import type { ApiRateLimitEntry } from './types.js';

export function consumeRateLimit(
  ctx: ControlStateContext,
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const entryKey = `${bucket}:${key}`;
  const current = snapshot.rateLimits.find((entry) => entry.key === entryKey);

  if (!current || current.resetAt <= nowMs) {
    const nextEntry: ApiRateLimitEntry = {
      key: entryKey,
      count: 1,
      resetAt: nowMs + windowMs,
    };
    snapshot.rateLimits = snapshot.rateLimits
      .filter((entry) => entry.key !== entryKey)
      .concat(nextEntry);
    ctx.writeState(snapshot);
    return { allowed: true };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000)),
    };
  }

  current.count += 1;
  ctx.writeState(snapshot);
  return { allowed: true };
}
