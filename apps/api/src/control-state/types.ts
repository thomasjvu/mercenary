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

export type SellerPayoutEntry = {
  id: string;
  providerId: string;
  raidId: string;
  grossUsd: number;
  status: string;
  txHash?: string;
  createdAt: string;
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

export type UpstreamProviderKind = 'venice' | 'redpill' | 'near' | 'chutes' | 'phala';

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

export type ApiControlStateSnapshot = {
  version: 1;
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
  agentPaymentSessions: AgentPaymentSessionEntry[];
  settings: ApiRuntimeSettings;
};

export interface ApiControlStateStore {
  loadState(): ApiControlStateSnapshot;
  saveState(snapshot: ApiControlStateSnapshot): void;
}
