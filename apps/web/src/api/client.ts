import { TIMEOUTS } from '@bossraid/constants';

export type Provider = {
  providerId: string;
  agentId?: string;
  displayName: string;
  description?: string;
  specializations: string[];
  status: string;
  modelFamily?: string;
  agentFramework?: 'codex' | 'claude_code' | 'openclaw' | 'custom';
  modelProvider?: string;
  modelId?: string;
  outputTypes?: string[];
  lastSeenAt?: string;
  verification?: {
    status: 'pending' | 'verified' | 'failed' | 'error';
    checkedAt?: string;
    apiVerified?: boolean;
    frameworkVerified?: boolean;
    modelVerified?: boolean;
    notes?: string[];
  };
  privacy?: {
    score?: number;
    teeAttested?: boolean;
    e2ee?: boolean;
    noDataRetention?: boolean;
    signedOutputs?: boolean;
  };
  erc8004?: {
    agentId: string;
    operatorWallet?: string;
    registrationTx?: string;
    identityRegistry?: string;
    reputationRegistry?: string;
    validationRegistry?: string;
    validationTxs?: string[];
    lastVerifiedAt?: string;
    verification?: {
      status: 'not_checked' | 'verified' | 'partial' | 'failed' | 'error';
      checkedAt: string;
      chainId?: string;
      agentRegistry?: string;
      owner?: string;
      agentUri?: string;
      registrationTxFound?: boolean;
      operatorMatchesOwner?: boolean;
      identityRegistryReachable?: boolean;
      reputationRegistryReachable?: boolean;
      validationRegistryReachable?: boolean;
      notes?: string[];
    };
  };
  trust?: {
    score?: number;
    reason?: string;
    source?: 'erc8004';
  };
  scores?: {
    privacyScore: number;
    reputationScore: number;
  };
  pricePerTaskUsd: number;
  reputation: {
    globalScore: number;
    responsivenessScore: number;
    validityScore: number;
    qualityScore: number;
    timeoutRate: number;
    totalSuccessfulRaids: number;
  };
};

export type ProviderHealth = {
  providerId: string;
  providerName?: string;
  endpoint?: string;
  reachable: boolean;
  ready: boolean;
  statusCode?: number;
  missing?: string[];
  model?: string | null;
  modelApiBase?: string;
  error?: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Record<string, string>;
};

export const API_BASE =
  (import.meta.env?.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ?? '/api';
export const RAID_ACCESS_TOKEN_HEADER = 'x-bossraid-raid-token';
const ACTION_REQUEST_TIMEOUT_MS = TIMEOUTS.ACTION_REQUEST;

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (typeof payload.message === 'string' && payload.message.length > 0) {
        message = payload.message;
      } else if (typeof payload.error === 'string' && payload.error.length > 0) {
        message = payload.error;
      }
    } catch {
      // Ignore parse errors and keep the status-based message.
    }

    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function requestJsonDetailed<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId =
    timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
    const headers = Object.fromEntries(response.headers.entries());
    const text = await response.text();

    let data: T | undefined;
    let error: string | undefined;

    if (text.length > 0) {
      try {
        const parsed = JSON.parse(text) as T | { message?: string; error?: string };
        if (response.ok) {
          data = parsed as T;
        } else {
          error =
            typeof (parsed as { message?: string }).message === 'string'
              ? (parsed as { message?: string }).message
              : typeof (parsed as { error?: string }).error === 'string'
                ? (parsed as { error?: string }).error
                : undefined;
          data = parsed as T;
        }
      } catch {
        if (!response.ok) {
          error = text;
        }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: error ?? (response.ok ? undefined : `Request failed: ${response.status}`),
      headers,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: 0,
        error: `Request timed out after ${formatActionTimeoutMs(timeoutMs)}.`,
        headers: {},
      };
    }

    throw error;
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

function formatActionTimeoutMs(timeoutMs: number): string {
  if (timeoutMs < 1_000) {
    return `${timeoutMs}ms`;
  }

  return `${(timeoutMs / 1_000).toFixed(timeoutMs >= 10_000 ? 0 : 1)}s`;
}
