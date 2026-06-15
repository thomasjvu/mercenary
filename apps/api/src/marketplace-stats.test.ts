import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSellerModelDemand } from './marketplace-stats.js';

test('computeSellerModelDemand aggregates routed value by model in the last 24h', () => {
  const nowMs = Date.parse('2026-06-15T12:00:00.000Z');
  const demand = computeSellerModelDemand({
    nowMs,
    providers: [
      {
        providerId: 'venice-seller-abc-gemma',
        displayName: 'Gemma offer',
        modelId: 'google-gemma-4-31b-it',
        marketplaceOfferStatus: 'active',
      },
      {
        providerId: 'venice-seller-abc-claude',
        displayName: 'Claude offer',
        modelId: 'claude-opus-4-7',
        marketplaceOfferStatus: 'active',
      },
    ],
    payouts: [
      {
        id: 'p1',
        providerId: 'venice-seller-abc-gemma',
        raidId: 'raid-1',
        grossUsd: 0.12,
        status: 'settled',
        createdAt: '2026-06-15T10:00:00.000Z',
      },
      {
        id: 'p2',
        providerId: 'venice-seller-abc-gemma',
        raidId: 'raid-2',
        grossUsd: 0.08,
        status: 'settled',
        createdAt: '2026-06-15T08:00:00.000Z',
      },
      {
        id: 'p3',
        providerId: 'venice-seller-abc-claude',
        raidId: 'raid-3',
        grossUsd: 0.5,
        status: 'settled',
        createdAt: '2026-06-14T08:00:00.000Z',
      },
    ],
  });

  assert.equal(demand.length, 2);
  assert.equal(demand[0]?.modelId, 'google-gemma-4-31b-it');
  assert.equal(demand[0]?.routedRequests24h, 2);
  assert.equal(demand[0]?.routedValue24hUsd, 0.2);
  assert.ok(demand[0]?.referenceInputPer1mUsd != null);
  assert.equal(demand[1]?.modelId, 'claude-opus-4-7');
  assert.equal(demand[1]?.routedRequests24h, 0);
});
