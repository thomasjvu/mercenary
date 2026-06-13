import type { RaidProvider } from '@bossraid/provider-sdk';
import { providerMatchesDiscoveryQuery } from '@bossraid/provider-registry';
import type {
  ProviderDiscoveryQuery,
  ProviderHealthStatus,
  ProviderProfile,
} from '@bossraid/shared-types';
import type { SecretCipher } from '@bossraid/persistence';

export function normalizeProviderEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) {
    return undefined;
  }

  try {
    const url = new URL(endpoint);
    url.hash = '';
    url.search = '';
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    console.warn(`normalizeProviderEndpoint: invalid URL '${endpoint}', falling back to trimmed`);
    return endpoint.trim().replace(/\/+$/, '');
  }
}

export function encryptProviderProfileSecrets(
  provider: ProviderProfile,
  cipher: SecretCipher
): ProviderProfile {
  if (!cipher.enabled || !provider.auth || provider.auth.type === 'none') {
    return provider;
  }

  return {
    ...provider,
    auth: {
      ...provider.auth,
      token: provider.auth.token ? cipher.encrypt(provider.auth.token) : provider.auth.token,
      secret: provider.auth.secret ? cipher.encrypt(provider.auth.secret) : provider.auth.secret,
    },
  };
}

export function decryptProviderProfileSecrets(
  provider: ProviderProfile,
  cipher: SecretCipher
): ProviderProfile {
  if (!provider.auth || provider.auth.type === 'none') {
    return provider;
  }

  return {
    ...provider,
    auth: {
      ...provider.auth,
      token: provider.auth.token ? cipher.decrypt(provider.auth.token) : provider.auth.token,
      secret: provider.auth.secret ? cipher.decrypt(provider.auth.secret) : provider.auth.secret,
    },
  };
}

export type DropProviderAliasesOptions = {
  preserveSeededProvider: boolean;
};

import type { ProviderRegistryMaps } from './orchestrator-persistence.js';

export type { ProviderRegistryMaps };

export function dropProviderAliases(
  provider: ProviderProfile,
  maps: ProviderRegistryMaps,
  options: DropProviderAliasesOptions
): boolean {
  const providerEndpoint = normalizeProviderEndpoint(provider.endpoint);
  let changed = false;

  for (const candidate of [...maps.providers.values()]) {
    if (candidate.providerId === provider.providerId) {
      continue;
    }

    const sameAgentId = provider.agentId != null && candidate.agentId === provider.agentId;
    const sameEndpoint =
      providerEndpoint != null &&
      normalizeProviderEndpoint(candidate.endpoint) === providerEndpoint;
    if (!sameAgentId && !sameEndpoint) {
      continue;
    }

    if (
      options.preserveSeededProvider &&
      maps.seededProviderIds.has(candidate.providerId) &&
      !maps.seededProviderIds.has(provider.providerId)
    ) {
      continue;
    }

    maps.providers.delete(candidate.providerId);
    maps.providerRuntimes.delete(candidate.providerId);
    maps.providerHealthCache.delete(candidate.providerId);
    changed = true;
  }

  return changed;
}

export function filterProvidersByDiscoveryQuery(
  providers: ProviderProfile[],
  query: ProviderDiscoveryQuery,
  providerFreshMs: number,
  hasCapacity: (providerId: string) => boolean
): ProviderProfile[] {
  return providers
    .filter((provider) => hasCapacity(provider.providerId))
    .filter((provider) => providerMatchesDiscoveryQuery(provider, query, providerFreshMs));
}
