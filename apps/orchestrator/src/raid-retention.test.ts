import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidRecord } from '@bossraid/shared-types';
import { pruneTerminalRaidsForRetention, readRaidRetentionTtlMs } from './raid-retention.js';

function buildRaid(
  partial: Partial<RaidRecord> & Pick<RaidRecord, 'id' | 'status' | 'updatedAt'>
): RaidRecord {
  return {
    createdAt: partial.updatedAt,
    deadlineUnix: 0,
    task: partial.task ?? ({} as RaidRecord['task']),
    selectedProviders: [],
    reserveProviders: [],
    assignments: {},
    rankedSubmissions: [],
    reputationEvents: [],
    ...partial,
  };
}

test('readRaidRetentionTtlMs defaults to seven days', () => {
  assert.equal(readRaidRetentionTtlMs({}), 7 * 24 * 60 * 60 * 1_000);
});

test('readRaidRetentionTtlMs honors BOSSRAID_RAID_RETENTION_TTL_SEC', () => {
  assert.equal(readRaidRetentionTtlMs({ BOSSRAID_RAID_RETENTION_TTL_SEC: '3600' }), 3_600_000);
  assert.equal(readRaidRetentionTtlMs({ BOSSRAID_RAID_RETENTION_TTL_SEC: '0' }), 0);
});

test('pruneTerminalRaidsForRetention drops only stale terminal raids', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');
  const raids = [
    buildRaid({
      id: 'raid-active',
      status: 'running',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }),
    buildRaid({
      id: 'raid-fresh-final',
      status: 'final',
      updatedAt: '2026-06-12T00:00:00.000Z',
    }),
    buildRaid({
      id: 'raid-stale-final',
      status: 'final',
      updatedAt: '2026-05-01T00:00:00.000Z',
    }),
    buildRaid({
      id: 'raid-stale-cancelled',
      status: 'cancelled',
      updatedAt: '2026-04-01T00:00:00.000Z',
    }),
  ];

  const result = pruneTerminalRaidsForRetention(raids, {
    ttlMs: 7 * 24 * 60 * 60 * 1_000,
    nowMs,
  });

  assert.deepEqual(
    result.raids.map((raid) => raid.id),
    ['raid-active', 'raid-fresh-final']
  );
  assert.deepEqual(result.prunedRaidIds, ['raid-stale-final', 'raid-stale-cancelled']);
});
