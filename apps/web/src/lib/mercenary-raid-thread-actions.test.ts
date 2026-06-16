import assert from 'node:assert/strict';
import test from 'node:test';
import { createMercenaryThread } from './mercenary-threads.js';
import {
  buildDeleteThreadStore,
  buildRenameThreadStore,
  buildSelectThreadStore,
  buildStartNewThreadStore,
} from './mercenary-raid-thread-actions.js';

test('buildSelectThreadStore persists the active snapshot and switches threads', () => {
  const existing = createMercenaryThread({ id: 'thread-a', title: 'Existing' });
  const store = { activeThreadId: 'thread-a', threads: [existing] };
  const snapshot = createMercenaryThread({
    id: 'thread-a',
    title: 'Updated',
    raidBrief: 'ship cleanup',
  });
  const other = createMercenaryThread({ id: 'thread-b', title: 'Other' });
  const withOther = { activeThreadId: 'thread-a', threads: [snapshot, other] };

  const result = buildSelectThreadStore(withOther, snapshot, 'thread-b');
  assert.ok(result);
  assert.equal(result.store.activeThreadId, 'thread-b');
  assert.equal(result.thread.id, 'thread-b');
  assert.equal(result.store.threads[0]?.raidBrief, 'ship cleanup');
});

test('buildStartNewThreadStore prepends a fresh thread', () => {
  const existing = createMercenaryThread({ id: 'thread-a', title: 'Existing' });
  const store = { activeThreadId: 'thread-a', threads: [existing] };
  const snapshot = createMercenaryThread({ id: 'thread-a', raidBrief: 'draft brief' });

  const result = buildStartNewThreadStore(store, snapshot);
  assert.notEqual(result.thread.id, 'thread-a');
  assert.equal(result.store.activeThreadId, result.thread.id);
  assert.equal(result.store.threads[0]?.id, result.thread.id);
  assert.equal(result.store.threads[1]?.raidBrief, 'draft brief');
});

test('buildRenameThreadStore locks the renamed title', () => {
  const thread = createMercenaryThread({ id: 'thread-a', title: 'Old title' });
  const store = { activeThreadId: 'thread-a', threads: [thread] };

  const next = buildRenameThreadStore(store, 'thread-a', 'thread-a', '  Locked title  ');
  assert.equal(next.threads[0]?.title, 'Locked title');
  assert.equal(next.threads[0]?.titleLocked, true);
});

test('buildDeleteThreadStore replaces the last thread with a fresh one', () => {
  const only = createMercenaryThread({ id: 'thread-a', title: 'Only' });
  const store = { activeThreadId: 'thread-a', threads: [only] };
  const snapshot = createMercenaryThread({ id: 'thread-a', raidBrief: 'brief' });

  const result = buildDeleteThreadStore(store, snapshot, 'thread-a', 'thread-a');
  assert.notEqual(result.store.activeThreadId, 'thread-a');
  assert.equal(result.store.threads.length, 1);
  assert.ok(result.thread);
});

test('buildDeleteThreadStore keeps active thread when deleting a sidebar thread', () => {
  const active = createMercenaryThread({ id: 'thread-a', title: 'Active' });
  const other = createMercenaryThread({ id: 'thread-b', title: 'Other' });
  const store = { activeThreadId: 'thread-a', threads: [active, other] };
  const snapshot = createMercenaryThread({ id: 'thread-a', raidBrief: 'active brief' });

  const result = buildDeleteThreadStore(store, snapshot, 'thread-a', 'thread-b');
  assert.equal(result.store.activeThreadId, 'thread-a');
  assert.equal(result.store.threads.length, 1);
  assert.equal(result.store.threads[0]?.id, 'thread-a');
  assert.equal(result.thread, undefined);
});
