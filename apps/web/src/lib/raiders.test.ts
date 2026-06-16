import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider } from '../api/index.js';
import { buildRaiderRecord, compareRaiders, isVeniceProvider } from './raiders.js';

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
    } as Provider,
    { providerId: 'seller-a', ready: true, reachable: true }
  );

  assert.equal(record.ready, true);
  assert.equal(record.activityTone, 'ready');
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
    } as Provider,
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
    } as Provider,
    { providerId: 'high', ready: true, reachable: true }
  );

  assert.ok(compareRaiders(low, high, 'reputation') > 0);
  assert.ok(compareRaiders(low, high, 'wins') > 0);
  assert.ok(compareRaiders(low, high, 'price') > 0);
});
