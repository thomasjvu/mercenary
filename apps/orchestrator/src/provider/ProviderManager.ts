import {
  ProviderProfile,
  ProviderHealthStatus,
  ProviderTaskPackage,
  ProviderAcceptance,
  ProviderSubmission,
  ProviderHeartbeat,
} from '@bossraid/shared-types';
import { RaidProvider } from '@bossraid/provider-sdk';
import {
  refreshProviderScores,
  providerMatchesDiscoveryQuery,
  providerIsFresh,
  providerHeartbeatAgeMs,
} from '@bossraid/provider-registry';
import {
  buildProviderProfileFromRegistration,
  createProviderFromProfile,
} from '@bossraid/provider-sdk';

export class ProviderManager {
  /**
   * Register a provider with the manager.
   * @param providers Map of provider IDs to profiles
   * @param providerRuntimes Map of provider IDs to runtimes
   * @param provider The provider to register
   */
  static registerProvider(
    providers: Map<string, ProviderProfile>,
    providerRuntimes: Map<string, RaidProvider>,
    provider: RaidProvider
  ): void {
    refreshProviderScores(provider.profile);
    providers.set(provider.profile.providerId, provider.profile);
    providerRuntimes.set(provider.profile.providerId, provider);
  }

  /**
   * Upsert a registered provider from registration input.
   * @param providers Map of provider IDs to profiles
   * @param providerRuntimes Map of provider IDs to runtimes
   * @param input Registration input
   * @param normalizeProviderEndpoint Function to normalize endpoints
   * @returns The provider profile
   */
  static async upsertRegisteredProvider(
    providers: Map<string, ProviderProfile>,
    providerRuntimes: Map<string, RaidProvider>,
    input: any,
    normalizeProviderEndpoint: (endpoint: string | undefined) => string | undefined
  ): Promise<ProviderProfile> {
    const existing =
      providers.get(input.agentId) ??
      [...providers.values()].find(
        (provider) =>
          provider.agentId === input.agentId ||
          normalizeProviderEndpoint(provider.endpoint) === normalizeProviderEndpoint(input.endpoint)
      );
    const profile = buildProviderProfileFromRegistration(input, existing);
    profile.status = 'available';
    profile.lastSeenAt = new Date().toISOString();

    const provider = createProviderFromProfile(profile);
    ProviderManager.registerProvider(providers, providerRuntimes, provider);
    return profile;
  }

  /**
   * Record a provider heartbeat.
   * @param providers Map of provider IDs to profiles
   * @param input Heartbeat input
   * @param providerHealthProbe Function to probe provider health
   * @returns The updated provider profile or undefined if not found
   */
  static async recordAgentHeartbeat(
    providers: Map<string, ProviderProfile>,
    input: any,
    providerHealthProbe: (profile: ProviderProfile) => Promise<ProviderHealthStatus>
  ): Promise<ProviderProfile | undefined> {
    const provider = providers.get(input.agentId);
    if (!provider) {
      return undefined;
    }

    provider.status = input.status ?? 'available';
    provider.lastSeenAt = input.timestamp ?? new Date().toISOString();
    await providerHealthProbe(provider);
    refreshProviderScores(provider);
    return provider;
  }

  /**
   * Discover providers based on a query.
   * @param providers Map of provider IDs to profiles
   * @param query Discovery query
   * @param providerFreshMs Maximum heartbeat age to consider provider fresh
   * @returns Array of matching provider profiles
   */
  static discoverProviders(
    providers: Map<string, ProviderProfile>,
    query: any = {},
    providerFreshMs: number
  ): ProviderProfile[] {
    const readyProviderIds = ProviderManager.getReadyProviderIds(providers, providerFreshMs);
    return ProviderManager.filterDiscoverableProviders(
      Array.from(providers.values()),
      readyProviderIds,
      query,
      providerFreshMs
    );
  }

  /**
   * Discover providers for a specific raid.
   * @param providers Map of provider IDs to profiles
   * @param query Discovery query
   * @param providerFreshMs Maximum heartbeat age to consider provider fresh
   * @returns Array of matching provider profiles
   */
  static discoverProvidersForRaid(
    providers: Map<string, ProviderProfile>,
    query: any = {},
    providerFreshMs: number
  ): ProviderProfile[] {
    const readyProviderIds = ProviderManager.getReadyProviderIds(providers, providerFreshMs);
    return ProviderManager.filterDiscoverableProviders(
      Array.from(providers.values()),
      readyProviderIds,
      { ...query, onlineOnly: false },
      providerFreshMs
    );
  }

  /**
   * Get the set of provider IDs that are ready (have a recent heartbeat).
   * @param providers Map of provider IDs to profiles
   * @param providerFreshMs Maximum heartbeat age to consider provider fresh
   * @returns Set of ready provider IDs
   */
  static getReadyProviderIds(
    providers: Map<string, ProviderProfile>,
    providerFreshMs: number
  ): Set<string> {
    const readyProviderIds = new Set<string>();
    const now = Date.now();
    for (const [providerId, profile] of providers) {
      if (providerIsFresh(profile, providerFreshMs, now)) {
        readyProviderIds.add(providerId);
      }
    }
    return readyProviderIds;
  }

  /**
   * Filter providers based on a discovery query.
   * @param providers Array of provider profiles
   * @param readyProviderIds Set of provider IDs that are ready
   * @param query Discovery query
   * @param providerFreshMs Maximum heartbeat age to consider provider fresh
   * @returns Array of matching provider profiles
   */
  static filterDiscoverableProviders(
    providers: ProviderProfile[],
    readyProviderIds: Set<string>,
    query: any = {},
    providerFreshMs: number
  ): ProviderProfile[] {
    return providers
      .filter((provider) => readyProviderIds.has(provider.providerId))
      .filter((provider) => ProviderManager.providerHasCapacity(provider)) // Placeholder for capacity check
      .filter((provider) =>
        providerMatchesDiscoveryQuery(
          provider,
          {
            ...query,
            onlineOnly: false,
          },
          providerFreshMs
        )
      );
  }

  /**
   * Placeholder for checking if a provider has capacity.
   * @param provider Provider profile to check
   * @returns True if the provider has capacity (always true for now)
   */
  static providerHasCapacity(provider: ProviderProfile): boolean {
    // Implementation would check current load vs maxConcurrency
    return true;
  }
}
