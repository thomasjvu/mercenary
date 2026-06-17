import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider } from '../api/index.js';
import { buildRaiderRecord } from './raiders.js';
import {
  filterAndSortRaiders,
  hasActiveRaidersDirectory,
  matchesRaiderQuery,
  matchesRaiderStatusFilter,
  RAIDERS_DIRECTORY_DEFAULTS,
} from './raiders-directory.js';

function buildFixture(overrides: Partial<Provider> = {}): ReturnType<typeof buildRaiderRecord> {
  return buildRaiderRecord(
    {
      providerId: 'seller-a',
      displayName: 'Seller A',
      status: 'available',
      pricePerTaskUsd: 0.5,
      reputation: { globalScore: 0.8, totalSuccessfulRaids: 3, totalRaids: 4 },
      specializations: ['inference'],
      ...overrides,
    } as Provider,
    { providerId: 'seller-a', ready: true, reachable: true }
  );
}

test('matchesRaiderStatusFilter respects activity tones', () => {
  const ready = buildFixture();
  const offlineRecord = buildRaiderRecord(
    {
      providerId: 'seller-b',
      displayName: 'Seller B',
      status: 'offline',
      pricePerTaskUsd: 0.5,
      reputation: { globalScore: 0.2, totalSuccessfulRaids: 0, totalRaids: 0 },
      specializations: [],
    } as Provider,
    { providerId: 'seller-b', ready: false, reachable: false }
  );

  assert.equal(matchesRaiderStatusFilter(ready, 'all'), true);
  assert.equal(matchesRaiderStatusFilter(ready, 'ready'), true);
  assert.equal(matchesRaiderStatusFilter(offlineRecord, 'offline'), true);
  assert.equal(matchesRaiderStatusFilter(ready, 'offline'), false);
});

test('filterAndSortRaiders applies query and sort', () => {
  const alpha = buildFixture({ displayName: 'Alpha Venice', modelFamily: 'venice-alpha' });
  const beta = buildFixture({
    providerId: 'seller-b',
    displayName: 'Beta Core',
    modelFamily: 'core-beta',
    reputation: { globalScore: 0.95, totalSuccessfulRaids: 8, totalRaids: 8 },
  });

  const filtered = filterAndSortRaiders([alpha, beta], {
    ...RAIDERS_DIRECTORY_DEFAULTS,
    query: 'venice',
    sortKey: 'wins',
  });

  assert.deepEqual(
    filtered.map((raider) => raider.provider.providerId),
    ['seller-a']
  );
  assert.equal(matchesRaiderQuery(alpha, 'venice'), true);
});

test('hasActiveRaidersDirectory detects non-default state', () => {
  assert.equal(hasActiveRaidersDirectory(RAIDERS_DIRECTORY_DEFAULTS), false);
  assert.equal(
    hasActiveRaidersDirectory({ ...RAIDERS_DIRECTORY_DEFAULTS, statusFilter: 'ready' }),
    true
  );
  assert.equal(hasActiveRaidersDirectory({ ...RAIDERS_DIRECTORY_DEFAULTS, query: 'gpt' }), true);
  assert.equal(
    hasActiveRaidersDirectory({ ...RAIDERS_DIRECTORY_DEFAULTS, maxPriceUsd: 0.25 }),
    true
  );
});

test('filterAndSortRaiders applies max price ceiling and sorts by price', () => {
  const cheap = buildFixture({ providerId: 'cheap', pricePerTaskUsd: 0.2 });
  const mid = buildFixture({
    providerId: 'mid',
    displayName: 'Mid',
    pricePerTaskUsd: 0.6,
  });
  const pricey = buildFixture({
    providerId: 'pricey',
    displayName: 'Pricey',
    pricePerTaskUsd: 1.2,
  });

  const filtered = filterAndSortRaiders([pricey, mid, cheap], {
    ...RAIDERS_DIRECTORY_DEFAULTS,
    maxPriceUsd: 0.6,
  });

  assert.deepEqual(
    filtered.map((raider) => raider.provider.providerId),
    ['cheap', 'mid']
  );
});
