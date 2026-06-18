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
