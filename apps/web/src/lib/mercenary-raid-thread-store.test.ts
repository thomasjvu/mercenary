import assert from 'node:assert/strict';
import test from 'node:test';
import { createMercenaryThread } from './mercenary-threads.js';
import {
  applyMercenaryRaidThreadRecord,
  buildMercenaryRaidThreadPersistenceSignature,
} from './mercenary-raid-thread-store.js';

test('buildMercenaryRaidThreadPersistenceSignature tracks thread state', () => {
  const signature = buildMercenaryRaidThreadPersistenceSignature({
    threadId: 'thread-a',
    maxBudgetUsd: 12,
    brief: 'Ship marketplace cleanup',
    submittedBrief: 'Ship marketplace cleanup',
    run: null,
    error: null,
  });

  assert.match(signature, /thread-a/);
  assert.match(signature, /Ship marketplace cleanup/);
});

test('applyMercenaryRaidThreadRecord maps persisted thread fields', () => {
  const thread = createMercenaryThread({
    id: 'thread-b',
    maxBudgetUsd: 15,
    raidBrief: 'hello',
    lastSubmittedBrief: 'hello',
    launchError: 'payment required',
  });

  const applied = applyMercenaryRaidThreadRecord(thread);
  assert.equal(applied.maxBudgetUsd, 15);
  assert.equal(applied.launchError, 'payment required');
  assert.match(applied.persistenceSignature, /payment required/);
});
