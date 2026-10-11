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

for (const table of ['provider_records', 'launch_reservation_records', 'commit']) {
  test(`SQLite retries identical revisions after rollback at ${table}`, async (t) => {
    const { DatabaseSync } = await import('node:sqlite');
    const dir = await mkdtemp(join(tmpdir(), 'bossraid-rollback-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'state.sqlite');
    const persistence = new SqliteBossRaidPersistence(path);
    await persistence.loadState();
    const db = new DatabaseSync(path);
    t.after(() => db.close());
    if (table === 'commit') {
      db.exec(
        'create table parent (id integer primary key); create table child (parent_id integer references parent(id) deferrable initially deferred); create trigger fail_write after insert on launch_reservation_records begin insert into child values (1); end'
      );
    } else {
      db.exec(
        `create trigger fail_write before insert on ${table} begin select raise(abort, 'injected failure'); end`
      );
    }
    const snapshot = createEmptyPersistenceSnapshot();
    snapshot.raids = [buildRaid({ id: 'raid', status: 'queued', updatedAt: snapshot.savedAt })];
    snapshot.providers = [createProviderProfile('provider')];
    snapshot.launchReservations = [{ id: 'reservation' } as RaidLaunchReservationRecord];
    await assert.rejects(
      persistence.saveState(snapshot),
      /injected failure|FOREIGN KEY constraint failed/
    );
    assert.equal((await persistence.loadState()).raids.length, 0);
    db.exec('drop trigger fail_write');
    await persistence.saveState(snapshot);
    let loaded = await persistence.loadState();
    assert.deepEqual(loaded.raids, snapshot.raids);
    assert.deepEqual(loaded.providers, snapshot.providers);
    await persistence.saveState(createEmptyPersistenceSnapshot());
    await persistence.saveState(snapshot);
    loaded = await persistence.loadState();
    assert.deepEqual(loaded.raids, snapshot.raids);
    assert.deepEqual(loaded.providers, snapshot.providers);
  });
}
