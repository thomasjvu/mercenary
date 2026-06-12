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
  facilitator: string | null;
  canEnable: boolean;
  blockers: string[];
  payTo: string | null;
};

export type OpsSettingsResponse = {
  x402: OpsX402SettingsResponse;
};

export type ProductionReadinessCheckResponse = {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
};

export type ProductionReadinessResponse = {
  ok: boolean;
  status: 'ready' | 'blocked';
  generatedAt: string;
  summary: {
    checks: number;
    blockingFailures: number;
    warnings: number;
  };
  checks: ProductionReadinessCheckResponse[];
  nextActions: Array<{
    check: string;
    action: string;
  }>;
};

export type SettlementStatusResponse = {
  mode: string;
  configured: boolean;
  chain: { id: string } | null;
  contracts: {
    registry: string | null;
    escrow: string | null;
    token: string | null;
  };
  rpcUrl: string | null;
};

export type OpsMetricsRouteStatsResponse = {
  count: number;
  errorCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  averageLatencyMs: number;
};

export type OpsMetricsResponse = {
  startedAt: string;
  generatedAt: string;
  counters: Record<string, number>;
  routes: Record<string, OpsMetricsRouteStatsResponse>;
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
