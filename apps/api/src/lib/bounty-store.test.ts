import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestBountyService } from '../test/helpers.js';

test('claimDeliveredAwardForPayment allows only one concurrent claim', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-claim-' });
  const now = new Date().toISOString();

  store.saveAward({
    id: 'award_claim_test',
    bountyId: 'bounty_claim_test',
    bidId: 'bid_claim_test',
    providerId: 'provider-a',
    status: 'delivered',
    amountUsd: 5,
    createdAt: now,
    updatedAt: now,
  });

  const first = store.claimDeliveredAwardForPayment('award_claim_test');
  const second = store.claimDeliveredAwardForPayment('award_claim_test');

  assert.equal(first?.status, 'paying');
  assert.equal(second, undefined);
});

test('tryAcquireDeadlineWorkerLock excludes concurrent workers until release', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-worker-' });

  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-a', 60_000), true);
  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-b', 60_000), false);
  store.releaseDeadlineWorkerLock('worker-a');
  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-b', 60_000), true);
});
