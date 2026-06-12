export type OpsSessionStatusResponse = {
  authenticated: boolean;
  expiresAt?: string;
};

export type OpsX402SettingsResponse = {
  enabled: boolean;
  envDefault: string | null;
  network: string;
  asset: string;
  payToConfigured: boolean;
  facilitatorConfigured: boolean;
  canEnable: boolean;
  payTo: string | null;
};

export type OpsSettingsResponse = {
  x402: OpsX402SettingsResponse;
};

export type BuyerApiKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
};

export type PublicSessionView = {
  authenticated: boolean;
  wallet?: string;
  account?: {
    wallet: string;
    createdAt: string;
    balanceUsd?: number;
    sellerProviderIds: string[];
    apiKeys: BuyerApiKeyView[];
    totalSavingsUsd?: number;
  };
};

export type AuthNonceResponseView = {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type ApiKeyCreateResponseView = {
  apiKey: string;
  key: BuyerApiKeyView;
};
