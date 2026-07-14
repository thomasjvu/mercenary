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

export type BuyerPurchaseEntry = {
  id: string;
  wallet: string;
  apiKeyId?: string;
  raidId: string;
  modelId?: string;
  sellerId?: string;
  costUsd: number;
  benchmarkPriceUsd?: number;
  savingsUsd?: number;
  route: 'raid' | 'chat' | 'inference';
  createdAt: string;
};

/**
 * Seller ledger row.
 * - accrued: credited to seller, not yet on-chain flushed (Surplus-style pending)
 * - settled: on-chain transfer completed (or file-mode flushed)
 * - failed: payout failed
 * Other strings kept for backwards compatibility with older rows.
 */
export type SellerPayoutStatus = 'accrued' | 'settled' | 'failed' | string;

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
  | 'anthropic';

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
