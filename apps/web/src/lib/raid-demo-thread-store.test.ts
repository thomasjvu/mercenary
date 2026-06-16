import assert from 'node:assert/strict';
import test from 'node:test';
import { createMercenaryThread } from './mercenary-threads.js';
import {
  applyRaidDemoThreadRecord,
  buildRaidDemoThreadPersistenceSignature,
} from './raid-demo-thread-store.js';

test('buildRaidDemoThreadPersistenceSignature tracks thread state', () => {
  const signature = buildRaidDemoThreadPersistenceSignature({
    threadId: 'thread-a',
    mode: 'raid',
    brief: 'Ship marketplace cleanup',
    submittedBrief: 'Ship marketplace cleanup',
    run: null,
    error: null,
  });

  assert.match(signature, /thread-a/);
  assert.match(signature, /Ship marketplace cleanup/);
});

test('applyRaidDemoThreadRecord maps persisted thread fields', () => {
  const thread = createMercenaryThread({
    id: 'thread-b',
    demoMode: 'chat_v1',
    liveDemoBrief: 'hello',
    lastSubmittedBrief: 'hello',
    launchError: 'payment required',
  });

  const applied = applyRaidDemoThreadRecord(thread);
  assert.equal(applied.demoMode, 'chat_v1');
  assert.equal(applied.launchError, 'payment required');
  assert.match(applied.persistenceSignature, /payment required/);
});
