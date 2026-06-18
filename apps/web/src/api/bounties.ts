import type { BountyDetailView, BountyRecord } from '@bossraid/shared-types';
import { fetchJson, requestJsonDetailedWeb } from './client.js';

export type BountyBoardResponse = {
  cloudEnabled: boolean;
  bounties: BountyRecord[];
};

export function listBounties(status = 'open'): Promise<BountyBoardResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson(`/v1/bounties${query}`);
}

export function getBounty(bountyId: string): Promise<BountyDetailView> {
  return fetchJson(`/v1/bounties/${encodeURIComponent(bountyId)}`);
}

export async function createBounty(
  body: Record<string, unknown>
): Promise<{ bounty: BountyRecord }> {
  const response = await requestJsonDetailedWeb<{ bounty: BountyRecord }>('/v1/bounties', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error?.message ?? 'Failed to create bounty');
  }
  return response.data;
}

export async function fundBounty(
  bountyId: string,
  body: Record<string, unknown> = {}
): Promise<{ bounty: BountyRecord }> {
  const response = await requestJsonDetailedWeb<{ bounty: BountyRecord }>(
    `/v1/bounties/${encodeURIComponent(bountyId)}/fund`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok || !response.data) {
    throw new Error(response.error?.message ?? 'Failed to fund bounty');
  }
  return response.data;
}
