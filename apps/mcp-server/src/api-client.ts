import type { BossRaidResultOutput, BossRaidStatusOutput } from '@bossraid/shared-types';
import { HTTP, NETWORK } from '@bossraid/constants';

export const apiBase =
  process.env.BOSSRAID_API_BASE ?? `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_API_PORT}`;

const RAID_ACCESS_TOKEN_HEADER = HTTP.BOSSRAID_RAID_TOKEN_HEADER;

export async function getRaidStatus(
  raidId: string,
  raidAccessToken?: string
): Promise<BossRaidStatusOutput> {
  return (await apiRequest(`/v1/raid/${encodeURIComponent(raidId)}`, {
    headers: raidHeaders(raidAccessToken),
  })) as BossRaidStatusOutput;
}

export async function getRaidResult(
  raidId: string,
  raidAccessToken?: string
): Promise<BossRaidResultOutput> {
  return (await apiRequest(`/v1/raid/${encodeURIComponent(raidId)}/result`, {
    headers: raidHeaders(raidAccessToken),
  })) as BossRaidResultOutput;
}

export function raidHeaders(raidAccessToken?: string): Record<string, string> | undefined {
  if (!raidAccessToken) {
    return undefined;
  }

  return {
    [RAID_ACCESS_TOKEN_HEADER]: raidAccessToken,
  };
}

export async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(new URL(path, apiBase), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text.length > 0 ? safeParseJson(text) : undefined;

  if (!response.ok) {
    const message =
      response.status === 402
        ? 'Boss Raid API requires x402 payment through the configured facilitator. Use a wallet-capable x402 client or disable x402 for private MCP use.'
        : payload &&
            typeof payload === 'object' &&
            payload !== null &&
            'message' in payload &&
            typeof payload.message === 'string'
          ? payload.message
          : payload &&
              typeof payload === 'object' &&
              payload !== null &&
              'error' in payload &&
              typeof payload.error === 'string'
            ? payload.error
            : `Boss Raid API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload ?? { ok: true };
}

export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
