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
  const raidById = new Map(raids.map((raid) => [raid.id, raid]));
  const pruneCandidates = new Set<string>();

  for (const raid of raids) {
    if (!TERMINAL_RAID_STATUSES.has(raid.status)) {
      continue;
    }

    const updatedAtMs = Date.parse(raid.updatedAt);
    if (!Number.isFinite(updatedAtMs) || updatedAtMs >= cutoffMs) {
      continue;
    }

    pruneCandidates.add(raid.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const raidId of [...pruneCandidates]) {
      const raid = raidById.get(raidId);
      if (!raid) {
        pruneCandidates.delete(raidId);
        changed = true;
        continue;
      }

      for (const childRaidId of raid.childRaidIds ?? []) {
        if (!pruneCandidates.has(childRaidId)) {
          pruneCandidates.delete(raidId);
          changed = true;
          break;
        }
      }
      if (!pruneCandidates.has(raidId)) {
        continue;
      }

      if (raid.parentRaidId) {
        const parent = raidById.get(raid.parentRaidId);
        if (parent && !TERMINAL_RAID_STATUSES.has(parent.status)) {
          pruneCandidates.delete(raidId);
          changed = true;
        }
      }
    }
  }

  const prunedRaidIds = [...pruneCandidates];
  const retainedRaids = raids.filter((raid) => !pruneCandidates.has(raid.id));

  return {
    raids: retainedRaids,
    prunedRaidIds,
  };
}
