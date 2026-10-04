import assert from 'node:assert/strict';
import test from 'node:test';
import type { BossRaidPersistenceSnapshot } from '@bossraid/shared-types';
import { providerPersistRevision, raidPersistRevision } from './revision.js';

const raid = {
  id: 'raid-revision',
  status: 'queued',
  updatedAt: '2026-10-02T00:00:00.000Z',
  selectedProviders: ['seller-a'],
} as BossRaidPersistenceSnapshot['raids'][number];

const provider = {
  providerId: 'seller-a',
  status: 'available',
  lastSeenAt: '2026-10-02T00:00:00.000Z',
} as BossRaidPersistenceSnapshot['providers'][number];

test('raid revisions ignore timestamp-only updates', () => {
  assert.equal(
    raidPersistRevision(raid),
    raidPersistRevision({ ...raid, updatedAt: '2026-10-02T00:01:00.000Z' })
  );
});

test('raid revisions detect lifecycle and provider changes', () => {
  assert.notEqual(raidPersistRevision(raid), raidPersistRevision({ ...raid, status: 'running' }));
  assert.notEqual(
    raidPersistRevision(raid),
    raidPersistRevision({ ...raid, selectedProviders: ['seller-b'] })
  );
});

test('provider revisions ignore heartbeat-only updates', () => {
  assert.equal(
    providerPersistRevision(provider),
    providerPersistRevision({ ...provider, lastSeenAt: '2026-10-02T00:01:00.000Z' })
  );
});

test('provider revisions detect routing availability changes', () => {
  assert.notEqual(
    providerPersistRevision(provider),
    providerPersistRevision({ ...provider, status: 'offline' })
  );
});
