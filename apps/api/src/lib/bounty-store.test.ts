import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createTestBountyService } from '../test/helpers.js';

function seedDeliveredAward(
  store: Awaited<ReturnType<typeof createTestBountyService>>['store'],
  awardId: string
) {
  const now = new Date().toISOString();
  store.saveAward({
    id: awardId,
    bountyId: 'bounty_claim_test',
    bidId: 'bid_claim_test',
    providerId: 'provider-a',
    status: 'delivered',
    amountUsd: 5,
    createdAt: now,
    updatedAt: now,
  });
}

test('claimDeliveredAwardForPayment happy path sets paying', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-claim-happy-' });
  seedDeliveredAward(store, 'award_claim_happy');

  const claimed = store.claimDeliveredAwardForPayment('award_claim_happy');

  assert.equal(claimed?.status, 'paying');
  assert.equal(store.getAward('award_claim_happy')?.status, 'paying');
});

test('claimDeliveredAwardForPayment allows only one concurrent claim', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-claim-' });
  seedDeliveredAward(store, 'award_claim_test');

  const first = store.claimDeliveredAwardForPayment('award_claim_test');
  const second = store.claimDeliveredAwardForPayment('award_claim_test');

  assert.equal(first?.status, 'paying');
  assert.equal(second, undefined);
});

test('claimDeliveredAwardForPayment recovers orphan claim while award still delivered', async () => {
  const { store, dir } = await createTestBountyService({
    prefix: 'bossraid-bounty-claim-orphan-',
    dbFileName: 'bounties.sqlite',
  });
  const awardId = 'award_claim_orphan';
  seedDeliveredAward(store, awardId);

  // Simulate crash after claim insert, before status→paying (orphan claim row).
  const db = new DatabaseSync(join(dir, 'bounties.sqlite'));
  try {
    db.prepare('insert into bounty_award_payment_claims (award_id, claimed_at) values (?, ?)').run(
      awardId,
      new Date().toISOString()
    );
  } finally {
    db.close();
  }

  assert.equal(store.getAward(awardId)?.status, 'delivered');

  const recovered = store.claimDeliveredAwardForPayment(awardId);
  assert.equal(recovered?.status, 'paying');
  assert.equal(store.getAward(awardId)?.status, 'paying');

  // Still exclusive after recovery.
  assert.equal(store.claimDeliveredAwardForPayment(awardId), undefined);
});

test('releasePayingAward returns award to delivered and clears claim', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-release-' });
  seedDeliveredAward(store, 'award_claim_release');

  assert.equal(store.claimDeliveredAwardForPayment('award_claim_release')?.status, 'paying');
  store.releasePayingAward('award_claim_release');
  assert.equal(store.getAward('award_claim_release')?.status, 'delivered');

  const reclaimed = store.claimDeliveredAwardForPayment('award_claim_release');
  assert.equal(reclaimed?.status, 'paying');
});

test('tryAcquireDeadlineWorkerLock excludes concurrent workers until release', async () => {
  const { store } = await createTestBountyService({ prefix: 'bossraid-bounty-worker-' });

  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-a', 60_000), true);
  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-b', 60_000), false);
  store.releaseDeadlineWorkerLock('worker-a');
  assert.equal(store.tryAcquireDeadlineWorkerLock('worker-b', 60_000), true);
});
