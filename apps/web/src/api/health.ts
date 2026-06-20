import { fetchJson } from './client.js';

export type ReadyTeeGate = {
  configured: boolean;
  platform: string | null;
  pathExists?: boolean;
  socketMounted?: boolean;
  mnemonicConfigured?: boolean;
};

export type ReadyResponse = {
  ok: boolean;
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
