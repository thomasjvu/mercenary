export type BountyStatus =
  | 'draft'
  | 'funded'
  | 'open'
  | 'awarded'
  | 'in_progress'
  | 'delivered'
  | 'paid'
  | 'expired'
  | 'refunded'
  | 'cancelled';

export type BountyBidStatus = 'pending' | 'awarded' | 'rejected' | 'withdrawn';

export type BountyAwardStatus =
  | 'pending'
  | 'in_progress'
  | 'delivered'
  | 'paying'
  | 'paid'
  | 'forfeited'
  | 'refunded';

export interface BountyDeadlines {
  biddingDeadlineAt: string;
  awardDeadlineAt: string;
  deliveryDeadlineAt: string;
  acceptDeadlineAt: string;
}

export interface BountyRecord {
  id: string;
  posterWallet: string;
  title: string;
  description: string;
  requirements: string;
  rewardAmountUsd: number;
  currency: string;
  maxAwards: number;
  status: BountyStatus;
  deadlines: BountyDeadlines;
  escrowJobId?: string;
  escrowReceiptJson?: string;
  linkedRaidId?: string;
  createdAt: string;
  updatedAt: string;
  fundedAt?: string;
  openedAt?: string;
  paidAt?: string;
}

export interface BountyBidRecord {
  id: string;
  bountyId: string;
  providerId: string;
  agentId?: string;
  bidderWallet?: string;
  priceUsd: number;
  etaHours: number;
  pitch: string;
  reputationScore: number;
  status: BountyBidStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BountyAwardRecord {
  id: string;
  bountyId: string;
  bidId: string;
  providerId: string;
  amountUsd: number;
  onchainAwardId?: string;
  status: BountyAwardStatus;
  deliveryHash?: string;
  artifactSummary?: string;
  artifactsJson?: string;
  linkedRaidId?: string;
  deliveredAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BountyEventRecord {
  id: string;
  bountyId: string;
  eventType: string;
  message: string;
  metadataJson?: string;
  createdAt: string;
}

export interface CreateBountyInput {
  title: string;
  description: string;
  requirements: string;
  rewardAmountUsd: number;
  currency?: string;
  maxAwards?: number;
  biddingDeadlineAt?: string;
  awardDeadlineAt?: string;
  deliveryDeadlineAt?: string;
  acceptDeadlineAt?: string;
}

export interface CreateBountyBidInput {
  providerId: string;
  agentId?: string;
  priceUsd: number;
  etaHours: number;
  pitch: string;
}

export interface AwardBountyBidsInput {
  bidIds: string[];
  amountsUsd?: number[];
}

export interface DeliverBountyAwardInput {
  artifactSummary: string;
  artifactsJson: string;
  deliveryHash: string;
}

export interface BountyBoardView {
  cloudEnabled: true;
  bounties: BountyRecord[];
}

export interface BountyDetailView {
  bounty: BountyRecord;
  bids: BountyBidRecord[];
  awards: BountyAwardRecord[];
}
