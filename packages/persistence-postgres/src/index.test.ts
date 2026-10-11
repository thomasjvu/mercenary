import assert from 'node:assert/strict';
import test from 'node:test';
import { ORCHESTRATOR_SCHEMA_SQL, API_CONTROL_STATE_SCHEMA_SQL } from './schema.js';

test('orchestrator schema includes raid and provider tables', () => {
  assert.match(ORCHESTRATOR_SCHEMA_SQL, /raid_records/);
  assert.match(ORCHESTRATOR_SCHEMA_SQL, /provider_records/);
  assert.match(ORCHESTRATOR_SCHEMA_SQL, /launch_reservation_records/);
  assert.match(ORCHESTRATOR_SCHEMA_SQL, /bossraid_meta/);
});

test('api control schema includes encrypted snapshot table', () => {
  assert.match(API_CONTROL_STATE_SCHEMA_SQL, /bossraid_api_control_state/);
  assert.match(API_CONTROL_STATE_SCHEMA_SQL, /snapshot_json/);
});

test('integration: PostgresBossRaidPersistence round-trip when DATABASE_URL set', async (t) => {
  const url = process.env.BOSSRAID_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    t.skip('Set BOSSRAID_DATABASE_URL to run live Postgres integration test');
    return;
  }

  const { createEmptyPersistenceSnapshot } = await import('@bossraid/persistence');
  const { createProviderProfile } = await import('@bossraid/test-fixtures');
  const { PostgresBossRaidPersistence } = await import('./index.js');
  const persistence = new PostgresBossRaidPersistence(url);

  const snapshot = createEmptyPersistenceSnapshot();
  snapshot.savedAt = new Date().toISOString();
  snapshot.raids = [
    {
      id: `raid_pg_${Date.now()}`,
      status: 'queued',
      createdAt: snapshot.savedAt,
      updatedAt: snapshot.savedAt,
      deadlineUnix: 0,
      task: {} as never,
      selectedProviders: [],
      reserveProviders: [],
      assignments: {},
      rankedSubmissions: [],
      reputationEvents: [],
    },
  ];
  snapshot.providers = [createProviderProfile(`provider_pg_${Date.now()}`)];

  await persistence.saveState(snapshot);
  const loaded = await persistence.loadState();
  assert.ok(loaded.raids.some((raid) => raid.id === snapshot.raids[0]?.id));
  assert.ok(
    loaded.providers.some((provider) => provider.providerId === snapshot.providers[0]?.providerId)
  );
  await persistence.close();
});

// A transactional pool fake keeps durable rows separate from pending writes.
class TransactionalPool {
  committed = new Map<string, Map<string, string>>();
  pending = new Map<string, Map<string, string>>();
  failAt?: string;
  async query(sql: string, values: unknown[] = []) {
    if (sql === 'begin') {
      this.pending = structuredClone(this.committed);
    } else if (sql === 'rollback') {
      this.pending = new Map();
    } else if (sql === 'commit') {
      if (this.failAt === 'commit') throw new Error('injected commit failure');
      this.committed = this.pending;
    } else if (sql.startsWith('insert into ')) {
      const table = sql.split(' ')[2]!;
      if (this.failAt === table) throw new Error('injected write failure');
      const rows = this.pending.get(table) ?? new Map<string, string>();
      rows.set(String(values[0]), String(values[2]));
      this.pending.set(table, rows);
    } else if (sql.startsWith('delete from ')) {
      const table = sql.split(' ')[2]!;
      const retained = new Set((values[0] as string[] | undefined) ?? []);
      for (const id of this.pending.get(table)?.keys() ?? []) {
        if (!retained.has(id)) this.pending.get(table)!.delete(id);
      }
    }
    return { rows: [], rowCount: 0 };
  }
  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
  async end() {}
}

for (const failAt of ['provider_records', 'launch_reservation_records', 'commit']) {
  test(`Postgres retries identical revisions after rollback at ${failAt}`, async () => {
    const { createEmptyPersistenceSnapshot } = await import('@bossraid/persistence');
    const { createProviderProfile } = await import('@bossraid/test-fixtures');
    const { PostgresBossRaidPersistence } = await import('./index.js');
    const pool = new TransactionalPool();
    const persistence = new PostgresBossRaidPersistence(
      pool as unknown as import('./index.js').PostgresPool
    );
    const snapshot = createEmptyPersistenceSnapshot();
    snapshot.raids = [
      {
        id: 'raid',
        status: 'queued',
        updatedAt: snapshot.savedAt,
      } as import('@bossraid/shared-types').RaidRecord,
    ];
    snapshot.providers = [createProviderProfile('provider')];
    snapshot.launchReservations = [
      { id: 'reservation' } as import('@bossraid/shared-types').RaidLaunchReservationRecord,
    ];
    pool.failAt = failAt;
    await assert.rejects(persistence.saveState(snapshot), /injected/);
    assert.equal(pool.committed.size, 0);
    pool.failAt = undefined;
    await persistence.saveState(snapshot);
    assert.equal(pool.committed.get('raid_records')?.has('raid'), true);
    assert.equal(pool.committed.get('provider_records')?.has('provider'), true);
    await persistence.saveState(createEmptyPersistenceSnapshot());
    await persistence.saveState(snapshot);
    assert.equal(pool.committed.get('raid_records')?.has('raid'), true);
    assert.equal(pool.committed.get('provider_records')?.has('provider'), true);
  });
}
