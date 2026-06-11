import { createHash } from 'node:crypto';
import type { ProviderProfile, RaidTaskSpec } from '@bossraid/shared-types';

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashRaidAccessToken(token: string): string {
  return sha256(token);
}

export function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

export function scoreSpecialization(provider: ProviderProfile, task: RaidTaskSpec): number {
  const required = new Set(
    task.constraints.requireSpecializations.map((item) => item.toLowerCase())
  );
  const isPatchTask = (task.output?.primaryType ?? 'patch') === 'patch';

  if (isPatchTask && task.framework) {
    required.add(String(task.framework).toLowerCase());
  }

  if (isPatchTask && task.language !== 'text') {
    required.add(task.language.toLowerCase());
  }

  const offered = new Set([
    ...provider.specializations.map((item) => item.toLowerCase()),
    ...provider.supportedFrameworks.map((item) => item.toLowerCase()),
    ...provider.supportedLanguages.map((item) => item.toLowerCase()),
  ]);

  if (required.size === 0) {
    return 1;
  }

  let matches = 0;
  for (const item of required) {
    if (offered.has(item)) {
      matches += 1;
    }
  }

  return matches / required.size;
}

export function normalizeLatency(p95LatencyMs: number, maxLatencySec: number): number {
  const budgetedMs = Math.max(maxLatencySec * 1_000, 1);
  return clamp01(1 - p95LatencyMs / (budgetedMs * 1.5));
}
