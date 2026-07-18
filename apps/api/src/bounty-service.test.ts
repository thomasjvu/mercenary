import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderProfile } from '@bossraid/shared-types';
import { hashDeliveryPayload } from './lib/bounty-service.js';
import { createTestBountyService } from './test/helpers.js';

test('bounty lifecycle: create, fund, bid, award, deliver, accept', async () => {
  const { service } = await createTestBountyService();

  const bounty = service.createBounty('0xPoster00000000000000000000000000000001', {
    title: 'Ship docs',
    description: 'Write integration docs',
    requirements: 'Markdown + curl examples',
    rewardAmountUsd: 10,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });

  const provider = {
    providerId: 'pqf_test',
    agentId: 'pqf_test',
    scores: { reputationScore: 80 },
  } as ProviderProfile;

  const bid = service.submitBid(
    bounty.id,
    {
      providerId: 'pqf_test',
      priceUsd: 10,
      etaHours: 12,
      pitch: 'Can ship in one day',
    },
    provider
  );

  const awarded = await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id] });
  assert.equal(awarded.awards.length, 1);

  const artifactsJson = JSON.stringify({ answer: 'done' });
  const delivered = await service.deliverAward(awarded.awards[0]!.id, 'pqf_test', {
    artifactSummary: 'Docs shipped',
    artifactsJson,
    deliveryHash: hashDeliveryPayload(artifactsJson),
  });
  assert.equal(delivered.status, 'delivered');

  const paid = await service.acceptAward(delivered.id, bounty.posterWallet);
  assert.equal(paid.status, 'paid');
});

test('auto-awards top bid after award deadline', async () => {
  const { service, store } = await createTestBountyService({
    prefix: 'bossraid-bounty-deadline-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_DEFAULT_DELIVERY_DAYS: '1',
      BOSSRAID_BOUNTY_DEFAULT_ACCEPT_DAYS: '1',
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '1',
    },
  });

  const bounty = service.createBounty('0xPoster00000000000000000000000000000002', {
    title: 'Auto award',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 5,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });

  const provider = {
    providerId: 'pqf_auto',
    scores: { reputationScore: 50 },
  } as ProviderProfile;
  service.submitBid(
    bounty.id,
    { providerId: 'pqf_auto', priceUsd: 5, etaHours: 4, pitch: 'fast' },
    provider
  );

  const stored = store.getBounty(bounty.id)!;
  store.saveBounty({
    ...stored,
    deadlines: {
      ...stored.deadlines,
      awardDeadlineAt: new Date(Date.now() - 30_000).toISOString(),
    },
  });

  const messages = await service.processDeadlines(new Date());
  assert.ok(messages.some((entry) => entry.startsWith('auto_awarded:')));
});

test('rejects double fund when escrow is already recorded', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-double-fund-',
  });
  const bounty = service.createBounty('0xPoster00000000000000000000000000000003', {
    title: 'Double fund',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 3,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, {
    openNow: true,
    escrowJobId: '1',
  });
  assert.throws(
    () => service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true }),
    /already funded/
  );
});

test('multi-award bounty stays awarded after first delivery', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-multi-award-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '3',
    },
  });

  const bounty = service.createBounty('0xPoster00000000000000000000000000000005', {
    title: 'Multi award',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 20,
    maxAwards: 2,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });

  const providerA = { providerId: 'pqf_a', scores: { reputationScore: 90 } } as ProviderProfile;
  const providerB = { providerId: 'pqf_b', scores: { reputationScore: 80 } } as ProviderProfile;
  const bidA = service.submitBid(
    bounty.id,
    { providerId: 'pqf_a', priceUsd: 10, etaHours: 2, pitch: 'a' },
    providerA
  );
  service.submitBid(
    bounty.id,
    { providerId: 'pqf_b', priceUsd: 10, etaHours: 3, pitch: 'b' },
    providerB
  );

  const firstAward = await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bidA.id] });
  assert.equal(firstAward.awards[0]!.amountUsd, 10);
  const artifactsJson = JSON.stringify({ answer: 'first' });
  await service.deliverAward(firstAward.awards[0]!.id, 'pqf_a', {
    artifactSummary: 'first delivery',
    artifactsJson,
    deliveryHash: hashDeliveryPayload(artifactsJson),
  });

  const detail = service.getDetail(bounty.id);
  assert.equal(detail.bounty.status, 'awarded');

  const bidB = detail.bids.find((entry: { providerId: string }) => entry.providerId === 'pqf_b');
  assert.ok(bidB);
  const secondAward = await service.awardBids(bounty.id, bounty.posterWallet, {
    bidIds: [bidB!.id],
  });
  assert.equal(secondAward.awards.length, 1);
  assert.equal(secondAward.awards[0]!.amountUsd, 10);

  const artifactsJsonB = JSON.stringify({ answer: 'second' });
  await service.deliverAward(secondAward.awards[0]!.id, 'pqf_b', {
    artifactSummary: 'second delivery',
    artifactsJson: artifactsJsonB,
    deliveryHash: hashDeliveryPayload(artifactsJsonB),
  });

  const finalDetail = service.getDetail(bounty.id);
  assert.equal(finalDetail.bounty.status, 'delivered');
});

test('rejects awards that exceed maxAwards across batches', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-max-awards-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '2',
    },
  });
  const bounty = service.createBounty('0xPoster00000000000000000000000000000006', {
    title: 'Max awards',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 10,
    maxAwards: 1,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const providerA = { providerId: 'pqf_cap_a', scores: { reputationScore: 1 } } as ProviderProfile;
  const providerB = { providerId: 'pqf_cap_b', scores: { reputationScore: 1 } } as ProviderProfile;
  const bidA = service.submitBid(
    bounty.id,
    { providerId: 'pqf_cap_a', priceUsd: 5, etaHours: 1, pitch: 'a' },
    providerA
  );
  const bidB = service.submitBid(
    bounty.id,
    { providerId: 'pqf_cap_b', priceUsd: 5, etaHours: 1, pitch: 'b' },
    providerB
  );
  await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bidA.id] });
  await assert.rejects(
    () => service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bidB.id] }),
    /already has 1 award/
  );
});

test('rejects partial allocation on final award slot', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-partial-final-slot-',
  });
  const bounty = service.createBounty('0xPoster00000000000000000000000000000007', {
    title: 'Partial final slot',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 10,
    maxAwards: 1,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const provider = { providerId: 'pqf_partial', scores: { reputationScore: 1 } } as ProviderProfile;
  const bid = service.submitBid(
    bounty.id,
    { providerId: 'pqf_partial', priceUsd: 5, etaHours: 1, pitch: 'partial' },
    provider
  );
  await assert.rejects(
    () =>
      service.awardBids(bounty.id, bounty.posterWallet, {
        bidIds: [bid.id],
        amountsUsd: [5],
      }),
    /full remaining bounty balance/
  );
});

test('claim is blocked before accept deadline', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-claim-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '1',
    },
  });
  const bounty = service.createBounty('0xPoster00000000000000000000000000000004', {
    title: 'Claim gate',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 2,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const provider = { providerId: 'pqf_claim', scores: { reputationScore: 1 } } as ProviderProfile;
  const bid = service.submitBid(
    bounty.id,
    { providerId: 'pqf_claim', priceUsd: 2, etaHours: 1, pitch: 'fast' },
    provider
  );
  const awarded = await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id] });
  const artifactsJson = JSON.stringify({ ok: true });
  const delivered = await service.deliverAward(awarded.awards[0]!.id, 'pqf_claim', {
    artifactSummary: 'done',
    artifactsJson,
    deliveryHash: hashDeliveryPayload(artifactsJson),
  });
  await assert.rejects(() => service.claimAward(delivered.id), /Accept deadline has not passed/);
});

test('forfeits undelivered award after delivery deadline', async () => {
  const { service, store } = await createTestBountyService({
    prefix: 'bossraid-bounty-forfeit-',
  });
  const bounty = service.createBounty('0xPoster00000000000000000000000000000008', {
    title: 'Forfeit',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 8,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const provider = {
    providerId: 'pqf_forfeit',
    scores: { reputationScore: 10 },
  } as ProviderProfile;
  const bid = service.submitBid(
    bounty.id,
    { providerId: 'pqf_forfeit', priceUsd: 8, etaHours: 1, pitch: 'slow' },
    provider
  );
  const awarded = await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id] });
  const awardId = awarded.awards[0]!.id;

  await assert.rejects(() => service.forfeitAward(awardId), /Delivery deadline has not passed/);

  const stored = store.getBounty(bounty.id)!;
  store.saveBounty({
    ...stored,
    deadlines: {
      ...stored.deadlines,
      deliveryDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
    },
  });

  const forfeited = await service.forfeitAward(awardId);
  assert.equal(forfeited.status, 'forfeited');
});

test('processDeadlines auto-forfeits past delivery and leftover-refunds partial awards', async () => {
  const { service, store } = await createTestBountyService({
    prefix: 'bossraid-bounty-deadline-forfeit-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '2',
    },
  });

  const bounty = service.createBounty('0xPoster00000000000000000000000000000009', {
    title: 'Partial leftover',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 20,
    maxAwards: 2,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const provider = {
    providerId: 'pqf_partial',
    scores: { reputationScore: 10 },
  } as ProviderProfile;
  const bid = service.submitBid(
    bounty.id,
    { providerId: 'pqf_partial', priceUsd: 8, etaHours: 1, pitch: 'partial' },
    provider
  );
  await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id], amountsUsd: [8] });

  const stored = store.getBounty(bounty.id)!;
  store.saveBounty({
    ...stored,
    deadlines: {
      ...stored.deadlines,
      awardDeadlineAt: new Date(Date.now() - 120_000).toISOString(),
      deliveryDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
    },
  });

  const messages = await service.processDeadlines(new Date());
  assert.ok(messages.some((entry) => entry.startsWith('auto_forfeited:')));
  assert.ok(messages.some((entry) => entry.startsWith('leftover_refunded:')));

  const awards = store.listAwardsForBounty(bounty.id);
  assert.equal(awards[0]!.status, 'forfeited');
  const after = store.getBounty(bounty.id)!;
  assert.equal(after.status, 'refunded');
});

test('createBounty rejects inverted deadline order (onchain-compatible)', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-deadline-order-',
  });
  const now = Date.now();
  assert.throws(
    () =>
      service.createBounty('0xPoster0000000000000000000000000000000b', {
        title: 'Bad deadlines',
        description: 'Test',
        requirements: 'Test',
        rewardAmountUsd: 1,
        biddingDeadlineAt: new Date(now + 60_000).toISOString(),
        awardDeadlineAt: new Date(now + 120_000).toISOString(),
        // delivery before award — invalid for BossBountyEscrow
        deliveryDeadlineAt: new Date(now + 30_000).toISOString(),
        acceptDeadlineAt: new Date(now + 180_000).toISOString(),
      }),
    /bidding < award < delivery < accept/
  );
});

test('leftover refund blocked before award deadline when awards exist', async () => {
  const { service } = await createTestBountyService({
    prefix: 'bossraid-bounty-leftover-gate-',
    env: {
      ...process.env,
      BOSSRAID_BOUNTY_AUTO_AWARD_MAX: '2',
    },
  });
  const bounty = service.createBounty('0xPoster0000000000000000000000000000000a', {
    title: 'Leftover gate',
    description: 'Test',
    requirements: 'Test',
    rewardAmountUsd: 15,
    maxAwards: 2,
  });
  service.fundBounty(bounty.id, bounty.posterWallet, { openNow: true });
  const provider = { providerId: 'pqf_gate', scores: { reputationScore: 1 } } as ProviderProfile;
  const bid = service.submitBid(
    bounty.id,
    { providerId: 'pqf_gate', priceUsd: 5, etaHours: 1, pitch: 'x' },
    provider
  );
  await service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id], amountsUsd: [5] });
  await assert.rejects(
    () => service.refundBounty(bounty.id, bounty.posterWallet),
    /Award deadline has not passed/
  );
});
