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
    tee: ReadyTeeGate;
  };
};

export async function fetchReady(): Promise<ReadyResponse> {
  return fetchJson<ReadyResponse>('/ready');
}
