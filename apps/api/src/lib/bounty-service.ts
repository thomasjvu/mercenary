import { createHash } from 'node:crypto';
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
import { readPositiveInteger } from './env.js';
import { BountyStore } from './bounty-store.js';
import {
  mapBountyOnchainError,
  resolveProviderAddress,
  type BountyOnchainExecutor,
} from './bounty-onchain.js';

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
    defaultBiddingDays: readPositiveInteger(env.BOSSRAID_BOUNTY_DEFAULT_BIDDING_DAYS, 7),
    defaultAwardDays: readPositiveInteger(env.BOSSRAID_BOUNTY_DEFAULT_AWARD_DAYS, 3),
    defaultDeliveryDays: readPositiveInteger(env.BOSSRAID_BOUNTY_DEFAULT_DELIVERY_DAYS, 14),
    defaultAcceptDays: readPositiveInteger(env.BOSSRAID_BOUNTY_DEFAULT_ACCEPT_DAYS, 7),
    autoAwardMax: readPositiveInteger(env.BOSSRAID_BOUNTY_AUTO_AWARD_MAX, 3),
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
    if (bounty.escrowJobId) {
      throw new BountyServiceError('Bounty escrow is already funded.', 409);
    }
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
    const existingAwards = this.store.listAwardsForBounty(bountyId).filter(isActiveBountyAward);
    const remainingSlots = bounty.maxAwards - existingAwards.length;
    if (remainingSlots <= 0) {
      throw new BountyServiceError(`This bounty already has ${bounty.maxAwards} award(s).`, 409);
    }
    if (input.bidIds.length > remainingSlots) {
      throw new BountyServiceError(
        `This bounty allows ${remainingSlots} more award(s) (${existingAwards.length}/${bounty.maxAwards} used).`,
        409
      );
    }

    const bids = input.bidIds.map((bidId) => {
      const bid = this.store.getBid(bidId);
      if (!bid || bid.bountyId !== bountyId || bid.status !== 'pending') {
        throw new BountyServiceError(`Bid ${bidId} is not awardable.`, 409);
      }
      return bid;
    });

    const remainingUsd = roundUsd(
      bounty.rewardAmountUsd - existingAwards.reduce((sum, award) => sum + award.amountUsd, 0)
    );
    if (remainingUsd <= 0) {
      throw new BountyServiceError('Bounty reward is fully allocated.', 409);
    }

    const slotAmounts = splitEvenly(remainingUsd, remainingSlots);
    const amounts = input.amountsUsd ?? slotAmounts.slice(0, bids.length);
    if (amounts.length !== bids.length) {
      throw new BountyServiceError('amountsUsd length must match bidIds.', 400);
    }
    const total = roundUsd(amounts.reduce((sum, value) => sum + value, 0));
    if (total > remainingUsd + 0.01) {
      throw new BountyServiceError(
        `Award amounts exceed remaining bounty balance (${remainingUsd} USD left).`,
        409
      );
    }
    if (!input.amountsUsd) {
      const expectedTotal = roundUsd(
        slotAmounts.slice(0, bids.length).reduce((sum, value) => sum + value, 0)
      );
      if (Math.abs(total - expectedTotal) > 0.01) {
        throw new BountyServiceError('Award amounts must match the remaining slot split.', 409);
      }
    }

    const nowIso = new Date().toISOString();
    const awards: BountyAwardRecord[] = [];
    const pendingAwards: Array<{
      bid: (typeof bids)[number];
      amountUsd: number;
      awardId: string;
    }> = [];

    for (let index = 0; index < bids.length; index += 1) {
      const bid = bids[index]!;
      const amountUsd = amounts[index]!;
      pendingAwards.push({
        bid,
        amountUsd,
        awardId: this.store.createId('awd'),
      });
    }

    const escrowJobId = bounty.escrowJobId;
    if (this.onchain && escrowJobId) {
      for (const pending of pendingAwards) {
        const providerAddress = resolveProviderAddress(
          pending.bid.providerId,
          this.onchain.providerAddresses
        );
        if (!providerAddress) {
          throw new BountyServiceError(
            `Provider ${pending.bid.providerId} has no payout address configured for onchain bounty awards.`,
            503
          );
        }
      }
    }

    for (const pending of pendingAwards) {
      let onchainAwardId: string | undefined;
      if (this.onchain && escrowJobId) {
        const providerAddress = resolveProviderAddress(
          pending.bid.providerId,
          this.onchain.providerAddresses
        )!;
        const onchainAward = await this.runOnchain(() =>
          this.onchain!.executor.createAward({
            onchainBountyId: escrowJobId,
            providerAddress,
            amountUsd: pending.amountUsd,
          })
        );
        onchainAwardId = onchainAward.onchainAwardId;
      }

      const award: BountyAwardRecord = {
        id: pending.awardId,
        bountyId,
        bidId: pending.bid.id,
        providerId: pending.bid.providerId,
        amountUsd: pending.amountUsd,
        onchainAwardId,
        status: 'in_progress',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.saveAward(award);
      this.store.saveBid({ ...pending.bid, status: 'awarded', updatedAt: nowIso });
      awards.push(award);
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
    this.store.saveAward(updated);
    if (this.onchain && award.onchainAwardId && input.deliveryHash) {
      try {
        await this.runOnchain(() =>
          this.onchain!.executor.submitDelivery({
            onchainAwardId: award.onchainAwardId!,
            deliveryHashHex: input.deliveryHash,
          })
        );
      } catch (error) {
        this.store.saveAward({
          ...award,
          status: 'in_progress',
          artifactSummary: undefined,
          artifactsJson: undefined,
          deliveryHash: undefined,
          deliveredAt: undefined,
          updatedAt: new Date().toISOString(),
        });
        throw error;
      }
    }
    const awards = this.store.listAwardsForBounty(bounty.id);
    this.store.saveBounty({
      ...bounty,
      status: resolveBountyStatusAfterDelivery(bounty, awards),
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

  async refundBounty(bountyId: string, posterWallet: string): Promise<BountyRecord> {
    const bounty = this.requireBounty(bountyId);
    this.requirePoster(bounty, posterWallet);
    if (!['open', 'funded', 'expired'].includes(bounty.status)) {
      throw new BountyServiceError('Bounty is not refundable.', 409);
    }
    if (Date.now() <= Date.parse(bounty.deadlines.biddingDeadlineAt)) {
      throw new BountyServiceError('Bidding deadline has not passed yet.', 409);
    }
    const awards = this.store.listAwardsForBounty(bountyId);
    if (awards.length > 0) {
      throw new BountyServiceError('Cannot refund a bounty that already has awards.', 409);
    }

    if (this.onchain && bounty.escrowJobId) {
      await this.runOnchain(() => this.onchain!.executor.refundUnawarded(bounty.escrowJobId!));
    }

    const nowIso = new Date().toISOString();
    const updated: BountyRecord = {
      ...bounty,
      status: 'refunded',
      updatedAt: nowIso,
    };
    this.store.saveBounty(updated);
    this.appendEvent(bountyId, 'bounty.refunded', 'Unawarded bounty escrow refunded');
    return updated;
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
        try {
          await this.refundBounty(bounty.id, bounty.posterWallet);
          messages.push(`refunded:${bounty.id}`);
        } catch {
          this.store.saveBounty({
            ...bounty,
            status: 'expired',
            updatedAt: nowIso,
          });
          this.appendEvent(bounty.id, 'bounty.expired', 'No bids before bidding deadline');
          messages.push(`expired:${bounty.id}`);
        }
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
        try {
          await this.awardBids(bounty.id, bounty.posterWallet, { bidIds: topBids });
          this.appendEvent(
            bounty.id,
            'bounty.auto_awarded',
            `Auto-awarded ${topBids.length} bid(s)`
          );
          messages.push(`auto_awarded:${bounty.id}`);
        } catch (error) {
          messages.push(
            `auto_award_failed:${bounty.id}:${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    for (const award of this.store.listDeliveredAwardsPastAcceptDeadline(nowIso)) {
      try {
        await this.claimAward(award.id);
        messages.push(`auto_claimed:${award.id}`);
      } catch (error) {
        messages.push(
          `auto_claim_failed:${award.id}:${error instanceof Error ? error.message : String(error)}`
        );
      }
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

    const claimed = this.store.claimDeliveredAwardForPayment(award.id);
    if (!claimed) {
      throw new BountyServiceError('Award payout is already in progress or completed.', 409);
    }

    const nowIso = new Date().toISOString();
    const updated: BountyAwardRecord = {
      ...claimed,
      status: 'paid',
      paidAt: nowIso,
      updatedAt: nowIso,
    };
    if (this.onchain && claimed.onchainAwardId) {
      try {
        if (eventType === 'award.claimed') {
          await this.runOnchain(() => this.onchain!.executor.claimPayout(claimed.onchainAwardId!));
        } else {
          await this.runOnchain(() => this.onchain!.executor.acceptAward(claimed.onchainAwardId!));
        }
      } catch (error) {
        this.store.releasePayingAward(award.id);
        throw error;
      }
    }
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

  private async runOnchain<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const mapped = mapBountyOnchainError(error);
      throw new BountyServiceError(mapped.message, 502);
    }
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

const DELIVERED_AWARD_STATUSES = new Set<BountyAwardRecord['status']>([
  'delivered',
  'paying',
  'paid',
]);

function resolveBountyStatusAfterDelivery(
  bounty: BountyRecord,
  awards: BountyAwardRecord[]
): BountyRecord['status'] {
  const allExistingDelivered = awards.every((entry) => DELIVERED_AWARD_STATUSES.has(entry.status));
  const allSlotsFilled = awards.length >= bounty.maxAwards;
  return allExistingDelivered && allSlotsFilled ? 'delivered' : 'awarded';
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

function isActiveBountyAward(award: BountyAwardRecord): boolean {
  return !['refunded', 'forfeited'].includes(award.status);
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
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
