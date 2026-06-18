import { createHash } from 'node:crypto';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type {
  AwardBountyBidsInput,
  BountyAwardRecord,
  BountyBidRecord,
  BountyRecord,
  CreateBountyBidInput,
  CreateBountyInput,
  DeliverBountyAwardInput,
  ProviderProfile,
} from '@bossraid/shared-types';
import type { Address } from 'viem';
import { BountyStore } from './bounty-store.js';
import { resolveProviderAddress, type BountyOnchainExecutor } from './bounty-onchain.js';

const DAY_MS = 86_400_000;

export type BountyServiceConfig = {
  defaultBiddingDays: number;
  defaultAwardDays: number;
  defaultDeliveryDays: number;
  defaultAcceptDays: number;
  autoAwardMax: number;
};

export function readBountyServiceConfig(env: NodeJS.ProcessEnv = process.env): BountyServiceConfig {
  return {
    defaultBiddingDays: readPositiveInt(env.BOSSRAID_BOUNTY_DEFAULT_BIDDING_DAYS, 7),
    defaultAwardDays: readPositiveInt(env.BOSSRAID_BOUNTY_DEFAULT_AWARD_DAYS, 3),
    defaultDeliveryDays: readPositiveInt(env.BOSSRAID_BOUNTY_DEFAULT_DELIVERY_DAYS, 14),
    defaultAcceptDays: readPositiveInt(env.BOSSRAID_BOUNTY_DEFAULT_ACCEPT_DAYS, 7),
    autoAwardMax: readPositiveInt(env.BOSSRAID_BOUNTY_AUTO_AWARD_MAX, 3),
  };
}

export type BountyOnchainContext = {
  executor: BountyOnchainExecutor;
  providerAddresses: Record<string, Address>;
};

export class BountyService {
  constructor(
    private readonly store: BountyStore,
    private readonly config: BountyServiceConfig,
    private readonly orchestrator?: BossRaidOrchestrator,
    private readonly onchain?: BountyOnchainContext
  ) {}

  createBounty(posterWallet: string, input: CreateBountyInput): BountyRecord {
    const now = new Date();
    const nowIso = now.toISOString();
    const deadlines = buildDeadlines(now, input, this.config);
    const record: BountyRecord = {
      id: this.store.createId('bty'),
      posterWallet: posterWallet.toLowerCase(),
      title: input.title.trim(),
      description: input.description.trim(),
      requirements: input.requirements.trim(),
      rewardAmountUsd: input.rewardAmountUsd,
      currency: (input.currency ?? 'USDC').toUpperCase(),
      maxAwards: Math.max(1, Math.min(input.maxAwards ?? 1, this.config.autoAwardMax)),
      status: 'draft',
      deadlines,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.store.saveBounty(record);
    this.appendEvent(record.id, 'bounty.created', 'Bounty draft created');
    return record;
  }

  fundBounty(
    bountyId: string,
    posterWallet: string,
    options: { escrowReceiptJson?: string; escrowJobId?: string; openNow?: boolean } = {}
  ): BountyRecord {
    const bounty = this.requireBounty(bountyId);
    this.requirePoster(bounty, posterWallet);
    if (!['draft', 'funded'].includes(bounty.status)) {
      throw new BountyServiceError('Only draft or funded bounties can be funded.', 409);
    }
    const nowIso = new Date().toISOString();
    const updated: BountyRecord = {
      ...bounty,
      status: options.openNow === false ? 'funded' : 'open',
      escrowReceiptJson: options.escrowReceiptJson ?? bounty.escrowReceiptJson,
      escrowJobId: options.escrowJobId ?? bounty.escrowJobId,
      fundedAt: bounty.fundedAt ?? nowIso,
      openedAt: options.openNow === false ? bounty.openedAt : (bounty.openedAt ?? nowIso),
      updatedAt: nowIso,
    };
    this.store.saveBounty(updated);
    this.appendEvent(bountyId, 'bounty.funded', 'Bounty escrow funded');
    return updated;
  }

  listOpenBounties(limit = 50): BountyRecord[] {
    return this.store
      .listBounties({ limit: 200 })
      .filter((bounty) => bounty.status === 'open')
      .slice(0, limit);
  }

  getDetail(bountyId: string): {
    bounty: BountyRecord;
    bids: BountyBidRecord[];
    awards: BountyAwardRecord[];
  } {
    const bounty = this.requireBounty(bountyId);
    return {
      bounty,
      bids: this.store.listBidsForBounty(bountyId),
      awards: this.store.listAwardsForBounty(bountyId),
    };
  }

  submitBid(
    bountyId: string,
    input: CreateBountyBidInput,
    provider: ProviderProfile
  ): BountyBidRecord {
    const bounty = this.requireBounty(bountyId);
    if (bounty.status !== 'open') {
      throw new BountyServiceError('Only open bounties accept bids.', 409);
    }
    if (Date.now() > Date.parse(bounty.deadlines.biddingDeadlineAt)) {
      throw new BountyServiceError('Bidding deadline has passed.', 409);
    }
    const nowIso = new Date().toISOString();
    const bid: BountyBidRecord = {
      id: this.store.createId('bid'),
      bountyId,
      providerId: input.providerId,
      agentId: input.agentId ?? provider.agentId,
      priceUsd: input.priceUsd,
      etaHours: input.etaHours,
      pitch: input.pitch.trim(),
      reputationScore: provider.scores?.reputationScore ?? 0,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.store.saveBid(bid);
    this.appendEvent(bountyId, 'bid.submitted', `Bid submitted by ${input.providerId}`, {
      bidId: bid.id,
    });
    return bid;
  }

  async awardBids(
    bountyId: string,
    posterWallet: string,
    input: AwardBountyBidsInput
  ): Promise<{ bounty: BountyRecord; awards: BountyAwardRecord[] }> {
    const bounty = this.requireBounty(bountyId);
    this.requirePoster(bounty, posterWallet);
    if (!['open', 'funded', 'awarded'].includes(bounty.status)) {
      throw new BountyServiceError('Bounty is not open for awards.', 409);
    }
    if (input.bidIds.length === 0) {
      throw new BountyServiceError('At least one bid id is required.', 400);
    }
    if (input.bidIds.length > bounty.maxAwards) {
      throw new BountyServiceError(`This bounty allows at most ${bounty.maxAwards} awards.`, 409);
    }

    const bids = input.bidIds.map((bidId) => {
      const bid = this.store.getBid(bidId);
      if (!bid || bid.bountyId !== bountyId || bid.status !== 'pending') {
        throw new BountyServiceError(`Bid ${bidId} is not awardable.`, 409);
      }
      return bid;
    });

    const amounts = input.amountsUsd ?? splitEvenly(bounty.rewardAmountUsd, bids.length);
    if (amounts.length !== bids.length) {
      throw new BountyServiceError('amountsUsd length must match bidIds.', 400);
    }
    const total = amounts.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - bounty.rewardAmountUsd) > 0.01) {
      throw new BountyServiceError('Award amounts must sum to the bounty reward.', 409);
    }

    const nowIso = new Date().toISOString();
    const awards: BountyAwardRecord[] = [];
    for (let index = 0; index < bids.length; index += 1) {
      const bid = bids[index]!;
      const amountUsd = amounts[index]!;
      const award: BountyAwardRecord = {
        id: this.store.createId('awd'),
        bountyId,
        bidId: bid.id,
        providerId: bid.providerId,
        amountUsd,
        status: 'in_progress',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.saveAward(award);
      this.store.saveBid({ ...bid, status: 'awarded', updatedAt: nowIso });
      awards.push(award);
    }

    if (this.onchain && bounty.escrowJobId) {
      for (let index = 0; index < awards.length; index += 1) {
        const award = awards[index]!;
        const bid = bids[index]!;
        const providerAddress = resolveProviderAddress(
          bid.providerId,
          this.onchain.providerAddresses
        );
        if (!providerAddress) {
          throw new BountyServiceError(
            `Provider ${bid.providerId} has no payout address configured for onchain bounty awards.`,
            503
          );
        }
        const onchainAward = await this.onchain.executor.createAward({
          onchainBountyId: bounty.escrowJobId,
          providerAddress,
          amountUsd: award.amountUsd,
        });
        award.onchainAwardId = onchainAward.onchainAwardId;
        this.store.saveAward(award);
      }
    }

    const updatedBounty: BountyRecord = {
      ...bounty,
      status: 'awarded',
      updatedAt: nowIso,
    };
    this.store.saveBounty(updatedBounty);
    this.appendEvent(bountyId, 'bounty.awarded', `Awarded ${awards.length} bid(s)`);
    return { bounty: updatedBounty, awards };
  }

  async deliverAward(
    awardId: string,
    providerId: string,
    input: DeliverBountyAwardInput
  ): Promise<BountyAwardRecord> {
    const award = this.requireAward(awardId);
    if (award.providerId !== providerId) {
      throw new BountyServiceError('Only the awarded provider can deliver.', 403);
    }
    if (!['pending', 'in_progress'].includes(award.status)) {
      throw new BountyServiceError('Award is not active.', 409);
    }
    const bounty = this.requireBounty(award.bountyId);
    if (Date.now() > Date.parse(bounty.deadlines.deliveryDeadlineAt)) {
      throw new BountyServiceError('Delivery deadline has passed.', 409);
    }
    const nowIso = new Date().toISOString();
    const updated: BountyAwardRecord = {
      ...award,
      status: 'delivered',
      artifactSummary: input.artifactSummary.trim(),
      artifactsJson: input.artifactsJson,
      deliveryHash: input.deliveryHash,
      deliveredAt: nowIso,
      updatedAt: nowIso,
    };
    if (this.onchain && award.onchainAwardId && input.deliveryHash) {
      await this.onchain.executor.submitDelivery({
        onchainAwardId: award.onchainAwardId,
        deliveryHashHex: input.deliveryHash,
      });
    }

    this.store.saveAward(updated);
    this.store.saveBounty({
      ...bounty,
      status: 'delivered',
      updatedAt: nowIso,
    });
    this.appendEvent(award.bountyId, 'award.delivered', `Delivery submitted for ${awardId}`);
    return updated;
  }

  async acceptAward(awardId: string, posterWallet: string): Promise<BountyAwardRecord> {
    const award = this.requireAward(awardId);
    const bounty = this.requireBounty(award.bountyId);
    this.requirePoster(bounty, posterWallet);
    return this.markPaid(award, bounty, 'award.accepted');
  }

  async claimAward(awardId: string): Promise<BountyAwardRecord> {
    const award = this.requireAward(awardId);
    if (award.status !== 'delivered') {
      throw new BountyServiceError('Only delivered awards can be claimed.', 409);
    }
    const bounty = this.requireBounty(award.bountyId);
    if (Date.now() < Date.parse(bounty.deadlines.acceptDeadlineAt)) {
      throw new BountyServiceError('Accept deadline has not passed yet.', 409);
    }
    return this.markPaid(award, bounty, 'award.claimed');
  }

  async processDeadlines(now = new Date()): Promise<string[]> {
    const messages: string[] = [];
    const nowIso = now.toISOString();

    for (const bounty of this.store.listOpenBountiesPastDeadline(nowIso)) {
      const bids = this.store
        .listBidsForBounty(bounty.id)
        .filter((bid) => bid.status === 'pending');
      const biddingPassed = now.getTime() >= Date.parse(bounty.deadlines.biddingDeadlineAt);
      const awardPassed = now.getTime() >= Date.parse(bounty.deadlines.awardDeadlineAt);

      if (bounty.status === 'open' && biddingPassed && bids.length === 0) {
        this.store.saveBounty({
          ...bounty,
          status: 'expired',
          updatedAt: nowIso,
        });
        this.appendEvent(bounty.id, 'bounty.expired', 'No bids before bidding deadline');
        messages.push(`expired:${bounty.id}`);
        continue;
      }

      if (
        (bounty.status === 'open' || bounty.status === 'funded') &&
        awardPassed &&
        bids.length > 0
      ) {
        const topBids = [...bids]
          .sort((left, right) => {
            if (left.priceUsd !== right.priceUsd) {
              return left.priceUsd - right.priceUsd;
            }
            return right.reputationScore - left.reputationScore;
          })
          .slice(0, bounty.maxAwards)
          .map((bid) => bid.id);
        await this.awardBids(bounty.id, bounty.posterWallet, { bidIds: topBids });
        this.appendEvent(bounty.id, 'bounty.auto_awarded', `Auto-awarded ${topBids.length} bid(s)`);
        messages.push(`auto_awarded:${bounty.id}`);
      }
    }

    for (const award of this.store.listDeliveredAwardsPastAcceptDeadline(nowIso)) {
      await this.claimAward(award.id);
      messages.push(`auto_claimed:${award.id}`);
    }

    return messages;
  }

  private async markPaid(
    award: BountyAwardRecord,
    bounty: BountyRecord,
    eventType: string
  ): Promise<BountyAwardRecord> {
    if (award.status !== 'delivered') {
      throw new BountyServiceError('Only delivered awards can be paid.', 409);
    }

    if (this.onchain && award.onchainAwardId) {
      if (eventType === 'award.claimed') {
        await this.onchain.executor.claimPayout(award.onchainAwardId);
      } else {
        await this.onchain.executor.acceptAward(award.onchainAwardId);
      }
    }

    const nowIso = new Date().toISOString();
    const updated: BountyAwardRecord = {
      ...award,
      status: 'paid',
      paidAt: nowIso,
      updatedAt: nowIso,
    };
    this.store.saveAward(updated);
    const awards = this.store.listAwardsForBounty(bounty.id);
    const allPaid = awards.every((entry) => entry.id === award.id || entry.status === 'paid');
    this.store.saveBounty({
      ...bounty,
      status: allPaid ? 'paid' : bounty.status,
      paidAt: allPaid ? nowIso : bounty.paidAt,
      updatedAt: nowIso,
    });
    this.appendEvent(bounty.id, eventType, `Paid award ${award.id}`);
    return updated;
  }

  private requireBounty(id: string): BountyRecord {
    const bounty = this.store.getBounty(id);
    if (!bounty) {
      throw new BountyServiceError('Bounty not found.', 404);
    }
    return bounty;
  }

  private requireAward(id: string): BountyAwardRecord {
    const award = this.store.getAward(id);
    if (!award) {
      throw new BountyServiceError('Award not found.', 404);
    }
    return award;
  }

  private requirePoster(bounty: BountyRecord, wallet: string): void {
    if (bounty.posterWallet !== wallet.toLowerCase()) {
      throw new BountyServiceError('Only the bounty poster can perform this action.', 403);
    }
  }

  private appendEvent(
    bountyId: string,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.store.appendEvent({
      id: this.store.createId('bev'),
      bountyId,
      eventType,
      message,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
      createdAt: new Date().toISOString(),
    });
  }
}

export class BountyServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'BountyServiceError';
  }
}

export function hashDeliveryPayload(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildDeadlines(
  now: Date,
  input: CreateBountyInput,
  config: BountyServiceConfig
): BountyRecord['deadlines'] {
  const biddingAt = input.biddingDeadlineAt
    ? new Date(input.biddingDeadlineAt)
    : new Date(now.getTime() + config.defaultBiddingDays * DAY_MS);
  const awardAt = input.awardDeadlineAt
    ? new Date(input.awardDeadlineAt)
    : new Date(biddingAt.getTime() + config.defaultAwardDays * DAY_MS);
  const deliveryAt = input.deliveryDeadlineAt
    ? new Date(input.deliveryDeadlineAt)
    : new Date(awardAt.getTime() + config.defaultDeliveryDays * DAY_MS);
  const acceptAt = input.acceptDeadlineAt
    ? new Date(input.acceptDeadlineAt)
    : new Date(deliveryAt.getTime() + config.defaultAcceptDays * DAY_MS);
  return {
    biddingDeadlineAt: biddingAt.toISOString(),
    awardDeadlineAt: awardAt.toISOString(),
    deliveryDeadlineAt: deliveryAt.toISOString(),
    acceptDeadlineAt: acceptAt.toISOString(),
  };
}

function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor((total / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => base);
  const remainder = Math.round((total - base * parts) * 100) / 100;
  if (remainder > 0) {
    amounts[amounts.length - 1] =
      Math.round((amounts[amounts.length - 1]! + remainder) * 100) / 100;
  }
  return amounts;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}
