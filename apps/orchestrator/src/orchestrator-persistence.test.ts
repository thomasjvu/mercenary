import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyPersistenceSnapshot,
  createSecretCipher,
  type BossRaidPersistence,
} from '@bossraid/persistence';
import type { RaidRecord } from '@bossraid/shared-types';
import {
  buildOrchestratorSnapshot,
  queueOrchestratorPersistBestEffort,
} from './orchestrator-persistence.js';
import { PersistenceQueue } from './persistence-queue.js';

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test('continuous updates retain first flush deadline and save the latest snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const queue = new PersistenceQueue();
  let version = 0;
  const saved: string[] = [];
  const persistence = {
    saveState: async (snapshot) => {
      saved.push(snapshot.savedAt);
    },
  } as BossRaidPersistence;
  const update = () =>
    queueOrchestratorPersistBestEffort(
      queue,
      persistence,
      () => ({ ...createEmptyPersistenceSnapshot(), savedAt: String(version) }),
      100
    );
  update();
  for (let i = 1; i <= 4; i++) {
    t.mock.timers.tick(20);
    version = i;
    update();
  }
  t.mock.timers.tick(20);
  await flushMicrotasks();
  assert.deepEqual(saved, ['4']);
  version = 5;
  update();
  t.mock.timers.tick(100);
  await flushMicrotasks();
  assert.deepEqual(saved, ['4', '5']);
});

test('updates during an in-flight save serialize a later latest snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const queue = new PersistenceQueue();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let version = 1;
  const saved: string[] = [];
  const persistence = {
    saveState: async (snapshot) => {
      saved.push(snapshot.savedAt);
      if (saved.length === 1) await pending;
    },
  } as BossRaidPersistence;
  const update = () =>
    queueOrchestratorPersistBestEffort(
      queue,
      persistence,
      () => ({ ...createEmptyPersistenceSnapshot(), savedAt: String(version) }),
      100
    );
  update();
  t.mock.timers.tick(100);
  await flushMicrotasks();
  version = 2;
  update();
  t.mock.timers.tick(100);
  await flushMicrotasks();
  version = 3;
  assert.deepEqual(saved, ['1']);
  finish();
  await flushMicrotasks();
  assert.deepEqual(saved, ['1', '3']);
});

function raid(id = 'same-id'): RaidRecord {
  return {
    id,
    status: 'queued',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deadlineUnix: 0,
    task: {} as RaidRecord['task'],
    selectedProviders: [],
    reserveProviders: [],
    assignments: {},
    rankedSubmissions: [],
    reputationEvents: [],
  };
}

function owner() {
  let raids: RaidRecord[] = [raid()];
  const input = {
    listAllRaids: () => raids,
    listProviders: () => [],
    launchReservations: new Map(),
    secretCipher: createSecretCipher({}),
    refreshProviderLiveness() {},
    pruneLaunchReservations() {},
  };
  return {
    snapshot: () => buildOrchestratorSnapshot(input),
    setRaids: (value: RaidRecord[]) => {
      raids = value;
    },
  };
}

test('snapshot caches clone raids, reuse retained revisions, and isolate owners', () => {
  const first = owner();
  const second = owner();
  const initial = first.snapshot().raids[0]!;
  assert.equal(first.snapshot().raids[0], initial);
  assert.notEqual(second.snapshot().raids[0], initial);
  const source = raid();
  first.setRaids([source]);
  source.status = 'running';
  assert.equal(initial.status, 'queued');
  assert.equal(first.snapshot().raids[0]?.status, 'running');
});

test('absent and retention-pruned raids release cached clones across repeated cycles', () => {
  const current = owner();
  for (let i = 0; i < 4; i++) {
    current.setRaids([raid()]);
    const before = current.snapshot().raids[0];
    current.setRaids([]);
    assert.deepEqual(current.snapshot().raids, []);
    current.setRaids([raid()]);
    assert.notEqual(current.snapshot().raids[0], before);
  }
  const source = raid('expired');
  source.status = 'final';
  const launchReservations = new Map();
  const input = {
    listAllRaids: () => [source],
    listProviders: () => [],
    launchReservations,
    secretCipher: createSecretCipher({}),
    refreshProviderLiveness() {},
    pruneLaunchReservations() {},
  };
  const before = buildOrchestratorSnapshot(input).raids[0];
  const dropped: string[] = [];
  assert.deepEqual(
    buildOrchestratorSnapshot({
      ...input,
      raidRetentionTtlMs: 1,
      dropRaids: (ids) => dropped.push(...ids),
    }).raids,
    []
  );
  assert.deepEqual(dropped, ['expired']);
  assert.notEqual(buildOrchestratorSnapshot(input).raids[0], before);
});
