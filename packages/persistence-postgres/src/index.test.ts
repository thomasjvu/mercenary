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
