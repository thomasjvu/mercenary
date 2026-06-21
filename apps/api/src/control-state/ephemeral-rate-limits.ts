type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitEntries = new Map<string, RateLimitEntry>();

function pruneExpired(nowMs: number): void {
  for (const [key, entry] of rateLimitEntries) {
    if (entry.resetAt <= nowMs) {
      rateLimitEntries.delete(key);
    }
  }
}

export function clearEphemeralRateLimitsForTests(): void {
  rateLimitEntries.clear();
}

export function consumeEphemeralRateLimit(
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs = Date.now()
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  pruneExpired(nowMs);
  const entryKey = `${bucket}:${key}`;
  const current = rateLimitEntries.get(entryKey);

  if (!current || current.resetAt <= nowMs) {
    rateLimitEntries.set(entryKey, {
      count: 1,
      resetAt: nowMs + windowMs,
    });
    return { allowed: true };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000)),
    };
  }

  current.count += 1;
  return { allowed: true };
}
