import { TERMINAL_RAID_STATUSES } from '@bossraid/constants';
import type { RaidRecord } from '@bossraid/shared-types';

const DEFAULT_RETENTION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type RaidRetentionOptions = {
  ttlMs: number;
  nowMs?: number;
};

export type RaidRetentionResult = {
  raids: RaidRecord[];
  prunedRaidIds: string[];
};

export function readRaidRetentionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.BOSSRAID_RAID_RETENTION_TTL_SEC;
  if (raw == null || raw.trim().length === 0) {
    return DEFAULT_RETENTION_TTL_MS;
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETENTION_TTL_MS;
  }

  if (seconds === 0) {
    return 0;
  }

  return seconds * 1_000;
}

export function pruneTerminalRaidsForRetention(
  raids: RaidRecord[],
  options: RaidRetentionOptions
): RaidRetentionResult {
  if (options.ttlMs <= 0) {
    return { raids, prunedRaidIds: [] };
  }

  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs - options.ttlMs;
  const prunedRaidIds: string[] = [];
  const retainedRaids = raids.filter((raid) => {
    if (!TERMINAL_RAID_STATUSES.has(raid.status)) {
      return true;
    }

    const updatedAtMs = Date.parse(raid.updatedAt);
    if (!Number.isFinite(updatedAtMs) || updatedAtMs >= cutoffMs) {
      return true;
    }

    prunedRaidIds.push(raid.id);
    return false;
  });

  return {
    raids: retainedRaids,
    prunedRaidIds,
  };
}
