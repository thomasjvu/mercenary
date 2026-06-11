import { TIMEOUTS } from '@bossraid/constants';
import type { ProviderHealthViewResponse, ProviderViewResponse } from '@bossraid/shared-types';

export type Provider = ProviderViewResponse;
export type ProviderHealth = ProviderHealthViewResponse;

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
