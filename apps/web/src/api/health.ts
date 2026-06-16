import { fetchJson } from './client.js';

export type ReadyTeeGate = {
  configured: boolean;
  platform: string | null;
  pathExists?: boolean;
  socketMounted?: boolean;
};

export type ReadyResponse = {
  ok: boolean;
  gates: {
    api: boolean;
    storage: boolean;
    secretsEncrypted: boolean;
    providers: boolean;
    x402: boolean;
    settlement: boolean;
    tee: ReadyTeeGate;
  };
  payment: {
    enabled: boolean;
    network: string;
    asset: string;
    facilitatorConfigured: boolean;
  };
  settlement: {
    mode: string;
    configured: boolean;
  };
};

export async function fetchReady(): Promise<ReadyResponse> {
  return fetchJson<ReadyResponse>('/ready');
}
