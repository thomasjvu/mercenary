import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider } from '../api/client.js';
import {
  buildRaiderRecord,
  compareRaiders,
  isVeniceProvider,
  summarizeRaiderDirectory,
} from './raiders.js';

test('buildRaiderRecord indexes provider fields for search', () => {
  const record = buildRaiderRecord(
    {
      providerId: 'seller-a',
      displayName: 'Venice Seller',
      modelFamily: 'venice-alpha',
      modelProvider: 'venice',
      status: 'available',
      pricePerTaskUsd: 0.5,
      reputation: { globalScore: 0.8, totalSuccessfulRaids: 2, totalRaids: 3 },
      specializations: ['inference'],
    } as unknown as Provider,
    { providerId: 'seller-a', ready: true, reachable: true }
  );

  assert.equal(record.ready, true);
  assert.equal(record.activityTone, 'ready');
  assert.equal(record.isOnline, true);
  assert.equal(record.onlineLabel, 'online');
  assert.ok(record.searchIndex.includes('venice'));
  assert.ok(isVeniceProvider(record.provider));
});

test('compareRaiders sorts by reputation and wins', () => {
  const low = buildRaiderRecord(
    {
      providerId: 'low',
      displayName: 'Low',
      status: 'available',
      pricePerTaskUsd: 1,
      reputation: { globalScore: 0.4, totalSuccessfulRaids: 1, totalRaids: 2 },
      specializations: [],
      scores: { reputationScore: 40, privacyScore: 0 },
    } as unknown as Provider,
    { providerId: 'low', ready: false, reachable: true }
  );
  const high = buildRaiderRecord(
    {
      providerId: 'high',
      displayName: 'High',
      status: 'available',
      pricePerTaskUsd: 0.5,
      reputation: { globalScore: 0.9, totalSuccessfulRaids: 9, totalRaids: 10 },
      specializations: [],
      scores: { reputationScore: 90, privacyScore: 0 },
    } as unknown as Provider,
    { providerId: 'high', ready: true, reachable: true }
  );

  assert.ok(compareRaiders(low, high, 'reputation') > 0);
  assert.ok(compareRaiders(low, high, 'wins') > 0);
  assert.ok(compareRaiders(low, high, 'price') > 0);
});

test('summarizeRaiderDirectory counts ready, private, and verified raiders', () => {
  const ready = buildRaiderRecord(
    {
      providerId: 'ready',
      displayName: 'Ready',
      status: 'available',
      pricePerTaskUsd: 1,
      reputation: { globalScore: 0.8, totalSuccessfulRaids: 1, totalRaids: 1 },
      specializations: [],
      erc8004: { verification: { status: 'verified' } },
      privacy: { teeAttested: true, e2ee: true },
      scores: { reputationScore: 80, privacyScore: 80 },
    } as unknown as Provider,
    { providerId: 'ready', ready: true, reachable: true }
  );
  const offline = buildRaiderRecord(
    {
      providerId: 'offline',
      displayName: 'Offline',
      status: 'offline',
      pricePerTaskUsd: 1,
      reputation: { globalScore: 0.2, totalSuccessfulRaids: 0, totalRaids: 0 },
      specializations: [],
      scores: { reputationScore: 20, privacyScore: 10 },
    } as unknown as Provider,
    { providerId: 'offline', ready: false, reachable: false }
  );

  assert.deepEqual(summarizeRaiderDirectory([ready, offline]), {
    readyCount: 1,
    privacyCount: 1,
    verifiedCount: 1,
    totalCount: 2,
  });
});
