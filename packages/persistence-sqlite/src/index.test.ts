import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createEmptyPersistenceSnapshot } from '@bossraid/persistence';
import { createProviderProfile } from '@bossraid/test-fixtures';
import type { RaidLaunchReservationRecord, RaidRecord } from '@bossraid/shared-types';
import { SqliteBossRaidPersistence } from './index.js';

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

test('SqliteBossRaidPersistence stores raids and providers in normalized tables', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-sqlite-'));
  const path = join(dir, 'state.sqlite');
  const persistence = new SqliteBossRaidPersistence(path);

  const snapshot = createEmptyPersistenceSnapshot();
  snapshot.savedAt = '2026-06-12T00:00:00.000Z';
  snapshot.raids = [
    buildRaid({
      id: 'raid_1',
      status: 'queued',
      updatedAt: snapshot.savedAt,
    }),
  ];
  snapshot.providers = [createProviderProfile('provider_1')];
  snapshot.launchReservations = [
    {
      id: 'reservation_1',
      route: 'raid',
      requestKey: 'request-key',
      createdAt: snapshot.savedAt,
      expiresAt: snapshot.savedAt,
      deadlineUnix: 1_700_000_000,
      mode: 'single',
      sanitized: {} as RaidLaunchReservationRecord['sanitized'],
      reservedProviderIds: ['provider_1'],
    },
  ];

  await persistence.saveState(snapshot);
  const loaded = await persistence.loadState();

  assert.equal(loaded.raids.length, 1);
  assert.equal(loaded.raids[0]?.id, 'raid_1');
  assert.equal(loaded.providers.length, 1);
  assert.equal(loaded.providers[0]?.providerId, 'provider_1');
  assert.equal(loaded.launchReservations?.length, 1);
  assert.equal(loaded.launchReservations?.[0]?.id, 'reservation_1');

  await rm(dir, { recursive: true, force: true });
});
