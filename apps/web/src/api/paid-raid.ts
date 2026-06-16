import { buildApiUrl } from './client.js';
import type { RaidSpawnOutput } from './raid.js';

export async function spawnPaidRaid(
  fetchWithPayment: typeof fetch,
  payload: unknown,
  apiBase: string
): Promise<RaidSpawnOutput> {
  const response = await fetchWithPayment(buildApiUrl('/v1/raid', apiBase), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text.length > 0 ? (JSON.parse(text) as RaidSpawnOutput) : undefined;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Paid raid failed (${response.status}).`;
    throw new Error(message);
  }

  if (!data?.raidId) {
    throw new Error('Paid raid response did not include a raid id.');
  }

  return data;
}
