import { TIMEOUTS } from '@bossraid/constants';
import { createFetchJson, requestJsonDetailed, type JsonResponse } from '@bossraid/http-client';
import type { ProviderHealthViewResponse, ProviderViewResponse } from '@bossraid/shared-types';

export type Provider = ProviderViewResponse;
export type ProviderHealth = ProviderHealthViewResponse;
export type ApiResponse<T> = JsonResponse<T>;

export const API_BASE =
  (import.meta.env?.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ?? '/api';
export const RAID_ACCESS_TOKEN_HEADER = 'x-bossraid-raid-token';
const ACTION_REQUEST_TIMEOUT_MS = TIMEOUTS.ACTION_REQUEST;

export const fetchJson = createFetchJson(API_BASE);

export async function requestJsonDetailedWeb<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = ACTION_REQUEST_TIMEOUT_MS
): Promise<ApiResponse<T>> {
  return requestJsonDetailed<T>(API_BASE, path, init, timeoutMs);
}
