import { createFetchJson, parseJsonErrorMessage } from '@bossraid/http-client';
import type {
  OpsSessionStatusResponse,
  OpsSettingsResponse,
  OpsX402SettingsResponse,
  ProviderHealthViewResponse,
  ProviderViewResponse,
  RaidListItemResponse,
  RaidResultResponse,
  RaidStatusResponse,
  RankedSubmissionResponse,
} from '@bossraid/shared-types';

export type RaidListItem = RaidListItemResponse;
export type RaidStatus = RaidStatusResponse;
export type RaidResult = RaidResultResponse;
export type RankedSubmission = RankedSubmissionResponse;
export type Provider = ProviderViewResponse;
export type ProviderHealth = ProviderHealthViewResponse;
export type OpsSessionStatus = OpsSessionStatusResponse;
export type OpsX402Settings = OpsX402SettingsResponse;
export type OpsSettings = OpsSettingsResponse;

export const API_BASE =
  (import.meta.env.VITE_BOSSRAID_OPS_API_BASE as string | undefined) ?? '/ops-api';

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
  });
}

export const fetchJson = createFetchJson(API_BASE, { credentials: 'same-origin' });

export async function fetchOpsSessionStatus(): Promise<OpsSessionStatus> {
  const response = await apiFetch('/v1/ops/session');
  if (response.status === 401) {
    return { authenticated: false };
  }
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = parseJsonErrorMessage(payload, response.status);
    } catch {
      // Ignore parse errors and keep the status-based message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<OpsSessionStatus>;
}

export async function createOpsSession(token: string): Promise<OpsSessionStatus> {
  return fetchJson<OpsSessionStatus>('/v1/ops/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
}

export async function deleteOpsSession(): Promise<OpsSessionStatus> {
  return fetchJson<OpsSessionStatus>('/v1/ops/session', {
    method: 'DELETE',
  });
}

export async function fetchOpsSettings(): Promise<OpsSettings> {
  return fetchJson<OpsSettings>('/v1/ops/settings');
}

export async function updateOpsX402Enabled(enabled: boolean): Promise<OpsSettings> {
  return fetchJson<OpsSettings>('/v1/ops/settings', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ x402Enabled: enabled }),
  });
}
