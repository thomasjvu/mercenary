import { probeProviderHealth } from '@bossraid/provider-sdk';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';

export const DEFAULT_PROVIDER_HEALTH_CACHE_TTL_MS = 5_000;

export type ProviderHealthProbe = typeof probeProviderHealth;

export class ProviderHealthCache {
  private readonly cache = new Map<string, { checkedAt: number; health: ProviderHealthStatus }>();

  constructor(
    private readonly ttlMs: number = DEFAULT_PROVIDER_HEALTH_CACHE_TTL_MS,
    private readonly probe: ProviderHealthProbe = probeProviderHealth
  ) {}

  delete(providerId: string): void {
    this.cache.delete(providerId);
  }

  async read(provider: ProviderProfile, nowMs: number = Date.now()): Promise<ProviderHealthStatus> {
    const cached = this.cache.get(provider.providerId);
    if (cached && nowMs - cached.checkedAt <= this.ttlMs) {
      return cached.health;
    }

    const health = await this.probe(provider);
    this.cache.set(provider.providerId, {
      checkedAt: nowMs,
      health,
    });
    return health;
  }
}
