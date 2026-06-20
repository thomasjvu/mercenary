import type { ReadyResponse } from '../api/health.js';

export function readApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Request failed.';
}

export function buildApiReadinessHint(error: unknown): string {
  const message = readApiErrorMessage(error).toLowerCase();

  if (message.includes('api_origin_not_configured')) {
    return 'Set the Cloudflare Pages secret BOSSRAID_API_ORIGIN to your public API host.';
  }

  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'Start the API with pnpm dev or pnpm dev:api, then reload.';
  }

  if (message.includes('timed out')) {
    return 'The API is not responding. Check that port 8787 is reachable from the web proxy.';
  }

  return 'Check API origin and readiness.';
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

const READY_GATE_LABELS: Record<string, string> = {
  storage: 'storage',
  secretsEncrypted: 'secret encryption',
  providers: 'providers',
  x402: 'x402',
  settlement: 'settlement',
  settlementFundJobs: 'settlement funding',
  settlementTerminalJobs: 'terminal settlement jobs',
  bountyEscrow: 'bounty escrow',
  upstreamMocksDisabled: 'upstream mocks',
  unverifiedBalanceFundDisabled: 'balance funding verification',
  unverifiedBountyFundDisabled: 'bounty funding verification',
  teeProductionReady: 'TEE production readiness',
};

export function listFailedReadyGates(gates: ReadyResponse['gates'] | undefined): string[] {
  if (!gates) {
    return [];
  }

  return Object.entries(gates)
    .filter(([key, value]) => key !== 'tee' && key !== 'api' && value === false)
    .map(([key]) => READY_GATE_LABELS[key] ?? key);
}

export function buildReadyNotOkMessage(gates: ReadyResponse['gates'] | undefined): string {
  const failed = listFailedReadyGates(gates);
  if (failed.length === 0) {
    return 'Boss Raid API is reachable but not fully ready.';
  }
  return `Boss Raid API is reachable but not fully ready (${failed.join(', ')}).`;
}

export function buildProductionOfflineHint(): string {
  return 'Some features are unavailable right now. Try again shortly.';
}
