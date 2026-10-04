import { createHash } from 'node:crypto';
import type { BossRaidPersistenceSnapshot } from '@bossraid/shared-types';

export function raidPersistRevision(raid: BossRaidPersistenceSnapshot['raids'][number]): string {
  const { updatedAt: _updatedAt, ...rest } = raid;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

export function providerPersistRevision(
  provider: BossRaidPersistenceSnapshot['providers'][number]
): string {
  const { lastSeenAt: _lastSeenAt, ...rest } = provider;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}
