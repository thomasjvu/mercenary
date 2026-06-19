import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidRecord } from '@bossraid/shared-types';
import { pruneTerminalRaidsForRetention } from './raid-retention.js';

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

test('pruneTerminalRaidsForRetention keeps parent while child raid is still active', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');
  const raids = [
    buildRaid({
      id: 'parent',
      status: 'final',
      updatedAt: '2026-05-01T00:00:00.000Z',
      childRaidIds: ['child-active'],
    }),
    buildRaid({
      id: 'child-active',
      status: 'running',
      updatedAt: '2026-06-12T00:00:00.000Z',
      parentRaidId: 'parent',
    }),
  ];

  const result = pruneTerminalRaidsForRetention(raids, {
    ttlMs: 7 * 24 * 60 * 60 * 1_000,
    nowMs,
  });

  assert.deepEqual(
    result.raids.map((raid) => raid.id),
    ['parent', 'child-active']
  );
  assert.deepEqual(result.prunedRaidIds, []);
});

test('pruneTerminalRaidsForRetention keeps child while parent is still active', () => {
  const nowMs = Date.parse('2026-06-12T12:00:00.000Z');
  const raids = [
    buildRaid({
      id: 'parent-active',
      status: 'running',
      updatedAt: '2026-06-12T00:00:00.000Z',
      childRaidIds: ['child'],
    }),
    buildRaid({
      id: 'child',
      status: 'final',
      updatedAt: '2026-05-01T00:00:00.000Z',
      parentRaidId: 'parent-active',
    }),
  ];

  const result = pruneTerminalRaidsForRetention(raids, {
    ttlMs: 7 * 24 * 60 * 60 * 1_000,
    nowMs,
  });

  assert.deepEqual(
    result.raids.map((raid) => raid.id),
    ['parent-active', 'child']
  );
  assert.deepEqual(result.prunedRaidIds, []);
});
