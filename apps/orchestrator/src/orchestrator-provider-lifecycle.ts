import { probeProviderHealth } from '@bossraid/provider-sdk';
import {
  providerHeartbeatAgeMs,
  providerIsFresh,
  providerMatchesDiscoveryQuery,
} from '@bossraid/provider-registry';
import type { ProviderDiscoveryQuery, ProviderProfile } from '@bossraid/shared-types';
import type { ProviderHealthCache } from './provider-health-cache.js';
import type { RuntimeOptions } from './runtime.js';

export function refreshProviderLiveness(
  providers: Iterable<ProviderProfile>,
  providerFreshMs: number,
  nowMs: number = Date.now()
): void {
  for (const provider of providers) {
    if (provider.status === 'offline') {
      continue;
    }

    const ageMs = providerHeartbeatAgeMs(provider, nowMs);
    if (ageMs == null) {
      continue;
    }

    provider.status = providerIsFresh(provider, providerFreshMs, nowMs) ? 'available' : 'degraded';
  }
}

export async function refreshProviderAvailability(input: {
  providers: ProviderProfile[];
  providerHealthCache: ProviderHealthCache;
  providerFreshMs: number;
  nowMs?: number;
}): Promise<Set<string>> {
  const providers = input.providers;
  if (providers.length === 0) {
    return new Set<string>();
  }

  const nowMs = input.nowMs ?? Date.now();
  const results = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      health: await input.providerHealthCache.read(provider, nowMs),
    }))
  );

  const readyProviderIds = new Set<string>();
  for (const { provider, health } of results) {
    if (health.ready) {
      provider.status = 'available';
      readyProviderIds.add(provider.providerId);
      continue;
    }

    provider.status = health.reachable ? 'degraded' : 'offline';
  }

  refreshProviderLiveness(providers, input.providerFreshMs, nowMs);
  return readyProviderIds;
}

export function filterReadyProvidersForRaid(
  providers: ProviderProfile[],
  readyProviderIds: Set<string>,
  providerHasCapacity: (providerId: string) => boolean,
  query: ProviderDiscoveryQuery,
  options: RuntimeOptions
): ProviderProfile[] {
  return providers
    .filter((provider) => readyProviderIds.has(provider.providerId))
    .filter((provider) => providerHasCapacity(provider.providerId))
    .filter((provider) =>
      providerMatchesDiscoveryQuery(
        provider,
        {
          ...query,
          onlineOnly: false,
        },
        options.providerFreshMs
      )
    );
}

export type ProviderHealthProbe = typeof probeProviderHealth;
