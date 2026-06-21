import { fetchJson } from './client.js';

export type ReadyTeeGate = {
  configured: boolean;
  platform: string | null;
  pathExists?: boolean;
  socketMounted?: boolean;
  mnemonicConfigured?: boolean;
};

export type ReadyPayment = {
  enabled: boolean;
  network?: string;
  asset?: string;
  facilitatorConfigured?: boolean;
};

export type ReadySettlement = {
  mode: string;
  configured: boolean;
};

export type ReadyResponse = {
  ok: boolean;
  payment?: ReadyPayment;
  settlement?: ReadySettlement;
  gates?: {
    api: boolean;
    storage: boolean;
    secretsEncrypted: boolean;
    providers: boolean;
    x402: boolean;
    settlement: boolean;
    settlementFundJobs?: boolean;
    settlementTerminalJobs?: boolean;
    bountyEscrow?: boolean;
    upstreamMocksDisabled?: boolean;
    unverifiedBalanceFundDisabled?: boolean;
    unverifiedBountyFundDisabled?: boolean;
    teeProductionReady?: boolean;
    tee: ReadyTeeGate;
  };
};

export async function fetchReady(): Promise<ReadyResponse> {
  return fetchJson<ReadyResponse>('/ready');
}
