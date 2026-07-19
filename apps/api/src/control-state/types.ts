export type ApiRuntimeSettings = {
  x402Enabled: boolean;
  seeded: boolean;
};

export type RelayerTaskEntry = {
  taskId: string;
  wallet?: string;
  raidId?: string;
  status: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
  memo?: string;
};

export type X402ReconciliationEntry = {
  id: string;
  kind: 'spawn_refund' | 'bounty_fund_refund' | 'balance_fund_refund';
  status: 'pending' | 'completed' | 'failed';
  reason: string;
  route: 'raid' | 'chat' | 'inference' | 'balance' | 'bounty';
  paymentSignature: string;
  paymentRequiredJson: string;
  bountyId?: string;
  raidId?: string;
  reservationId?: string;
  settlementTx?: string;
  attempts: number;
  lastError?: string;
  processingHolder?: string;
  processingExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentPaymentSessionEntry = {
  wallet: string;
  sessionAccount: string;
  permissionFrom: string;
  permissionContext: string;
  grantedAt: string;
  expiresAt: string;
  weeklyBudgetUsd?: number;
};

export type PublicAuthNonceEntry = {
  nonce: string;
  wallet?: string;
  expiresAt: number;
};

export type PublicSessionEntry = {
  token: string;
  wallet: string;
  expiresAt: number;
};

export type PublicAccountEntry = {
  wallet: string;
  createdAt: string;
  updatedAt: string;
  balanceUsd: number;
  sellerProviderIds: string[];
};

/**
 * Buyer money activity row (charges, hold releases, refunds).
 * - charged: work succeeded; costUsd kept
 * - hold_released: reserved prepaid/spend released (abort, zero-success, timeout)
 * - refunded: x402/mana refund completed or queued visibility
 * Older rows without status are treated as charged.
 */
export type BuyerPurchaseStatus = 'charged' | 'hold_released' | 'refunded';

export type BuyerPurchaseEntry = {
  id: string;
  wallet: string;
  apiKeyId?: string;
  raidId: string;
  modelId?: string;
  sellerId?: string;
  costUsd: number;
  /** Amount that was reserved before capture/release (when known). */
  reservedUsd?: number;
  benchmarkPriceUsd?: number;
  savingsUsd?: number;
  route: 'raid' | 'chat' | 'inference' | 'balance' | 'bounty';
  /** Defaults to charged when missing (legacy rows). */
  status?: BuyerPurchaseStatus;
  /** Human/machine reason: zero_success_refund, raid_aborted, terminal_wait_timeout, … */
  reason?: string;
  createdAt: string;
};

/**
 * Seller ledger row.
 * - accrued: credited to seller, not yet on-chain flushed (Surplus-style pending)
 * - flushing: claimed for an in-flight treasury transfer (not re-claimable)
 * - settled: on-chain transfer completed (or file-mode flushed)
 * - failed: payout failed
 * Other strings kept for backwards compatibility with older rows.
 */
export type SellerPayoutStatus = 'accrued' | 'flushing' | 'settled' | 'failed' | string;

export type SellerPayoutEntry = {
  id: string;
  providerId: string;
  raidId: string;
  grossUsd: number;
  status: SellerPayoutStatus;
  txHash?: string;
  createdAt: string;
  /** Set when batch flush marks the row settled. */
  flushedAt?: string;
  /** Claim id while status is flushing (prevents concurrent double-pay). */
  flushClaimId?: string;
  /** ISO timestamp when the row was claimed for flush. */
  flushingAt?: string;
};

export type BuyerApiKeyEntry = {
  id: string;
  wallet: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
  status: 'active' | 'revoked';
};

export type ApiOpsSessionEntry = {
  token: string;
  expiresAt: number;
};

export type ApiRateLimitEntry = {
  key: string;
  count: number;
  resetAt: number;
};

export type UpstreamProviderKind =
  | 'venice'
  | 'redpill'
  | 'near'
  | 'chutes'
  | 'phala'
  | 'xai'
  | 'zai'
  | 'anthropic'
  | 'darkbloom';

export type SellerUpstreamConfigEntry = {
  configId: string;
  wallet: string;
  provider: UpstreamProviderKind;
  apiKeyCiphertext: string;
  keyPrefix: string;
  upstreamBase: string;
  createdAt: string;
  updatedAt: string;
};

export type X402SettledPaymentEntry = {
  fingerprint: string;
  wallet: string;
  route: 'balance' | 'bounty' | 'raid' | 'chat' | 'inference';
  amountUsd: number;
  createdAt: string;
  /** Optional launch reservation id for raid/chat/inference idempotent re-entry after crash. */
  reservationId?: string;
};

export type ApiControlStateSnapshot = {
  version: number;
  savedAt: string;
  opsSessions: ApiOpsSessionEntry[];
  publicAuthNonces: PublicAuthNonceEntry[];
  publicSessions: PublicSessionEntry[];
  publicAccounts: PublicAccountEntry[];
  buyerApiKeys: BuyerApiKeyEntry[];
  buyerPurchases: BuyerPurchaseEntry[];
  sellerPayouts: SellerPayoutEntry[];
  sellerUpstreamConfigs: SellerUpstreamConfigEntry[];
  rateLimits: ApiRateLimitEntry[];
  relayerTasks: RelayerTaskEntry[];
  x402Reconciliations: X402ReconciliationEntry[];
  x402SettledPayments: X402SettledPaymentEntry[];
  agentPaymentSessions: AgentPaymentSessionEntry[];
  settings: ApiRuntimeSettings;
};

export interface ApiControlStateStore {
  loadState(): ApiControlStateSnapshot;
  saveState(snapshot: ApiControlStateSnapshot): void;
}
