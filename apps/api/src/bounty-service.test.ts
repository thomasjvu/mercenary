import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BountyStore } from './lib/bounty-store.js';
import { BountyService } from './lib/bounty-service.js';
import type { ProviderProfile } from '@bossraid/shared-types';

test('bounty lifecycle: create, fund, bid, award, deliver, accept', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-bounty-test-'));
  const store = new BountyStore(join(dir, 'bounties.sqlite'));
  const service = new BountyService(store, {
    defaultBiddingDays: 7,
    defaultAwardDays: 3,
    defaultDeliveryDays: 14,
    defaultAcceptDays: 7,
    autoAwardMax: 3,
  });

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

  const awarded = service.awardBids(bounty.id, bounty.posterWallet, { bidIds: [bid.id] });
  assert.equal(awarded.awards.length, 1);

  const artifactsJson = JSON.stringify({ answer: 'done' });
  const delivered = service.deliverAward(awarded.awards[0]!.id, 'pqf_test', {
    artifactSummary: 'Docs shipped',
    artifactsJson,
    deliveryHash: createHash('sha256').update(artifactsJson).digest('hex'),
  });
  assert.equal(delivered.status, 'delivered');

  const paid = service.acceptAward(delivered.id, bounty.posterWallet);
  assert.equal(paid.status, 'paid');
});

test('auto-awards top bid after award deadline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-bounty-deadline-'));
  const store = new BountyStore(join(dir, 'bounties.sqlite'));
  const service = new BountyService(store, {
    defaultBiddingDays: 7,
    defaultAwardDays: 3,
    defaultDeliveryDays: 1,
    defaultAcceptDays: 1,
    autoAwardMax: 1,
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

  const messages = service.processDeadlines(new Date());
  assert.ok(messages.some((entry) => entry.startsWith('auto_awarded:')));
});
