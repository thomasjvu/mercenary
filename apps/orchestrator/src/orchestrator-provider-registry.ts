import { refreshProviderScores } from '@bossraid/provider-registry';
import {
  buildProviderProfileFromRegistration,
  createProviderFromProfile,
  probeProviderHealth,
  type RaidProvider,
} from '@bossraid/provider-sdk';
import { selectProviders } from '@bossraid/raid-core';
import type {
  AgentHeartbeatInput,
  ProviderDiscoveryQuery,
  ProviderProfile,
  ProviderRegistrationInput,
  SanitizedTaskSpec,
  SelectedProviders,
} from '@bossraid/shared-types';
import type { ProviderRegistryMaps } from './orchestrator-persistence.js';
import {
  discoverProvidersForRaid as discoverProvidersForRaidWithCapacity,
  providerHasCapacity as providerHasCapacityForRaid,
  type OrchestratorProviderCapacityDeps,
} from './orchestrator-provider-capacity.js';
import {
  refreshProviderAvailability as refreshProviderAvailabilityState,
  refreshProviderLiveness as refreshProviderLivenessState,
} from './orchestrator-provider-lifecycle.js';
import { ProviderHealthCache, type ProviderHealthProbe } from './provider-health-cache.js';
import {
  dropProviderAliases,
  filterProvidersByDiscoveryQuery,
  normalizeProviderEndpoint,
} from './provider-registry-local.js';
import { InvalidRaidLaunchReservationError } from './raid-launch.js';
import type { RuntimeOptions } from './runtime.js';

export type ProviderRegistryCoordinatorDeps = {
  assertPersistenceWritable: () => void;
  queuePersist: () => Promise<void>;
  getProviderCapacityDeps: () => OrchestratorProviderCapacityDeps;
};

export class ProviderRegistrationConflictError extends Error {
  readonly code = 'provider_conflict';
  readonly conflict: {
    providerId: string;
    agentId?: string;
    reason: 'agent_id' | 'endpoint';
  };

  constructor(
    message: string,
    conflict: { providerId: string; agentId?: string; reason: 'agent_id' | 'endpoint' }
  ) {
    super(message);
    this.name = 'ProviderRegistrationConflictError';
    this.conflict = conflict;
  }
}

export class ProviderRegistryCoordinator {
  readonly providers = new Map<string, ProviderProfile>();
  readonly providerRuntimes = new Map<string, RaidProvider>();
  readonly providerIdsByAgentId = new Map<string, string>();
  readonly seededProviderIds = new Set<string>();
  readonly providerHealthCache: ProviderHealthCache;
  private roundRobinCursor = 0;

  constructor(
    private readonly options: RuntimeOptions,
    private readonly deps: ProviderRegistryCoordinatorDeps,
    providerHealthProbe: ProviderHealthProbe = probeProviderHealth
  ) {
    this.providerHealthCache = new ProviderHealthCache(undefined, providerHealthProbe);
  }

  seedProvider(provider: RaidProvider): void {
    this.seededProviderIds.add(provider.profile.providerId);
    this.registerProvider(provider);
  }

  registerProvider(provider: RaidProvider): void {
    refreshProviderScores(provider.profile);
    this.providers.set(provider.profile.providerId, provider.profile);
    this.providerRuntimes.set(provider.profile.providerId, provider);
    const agentId = provider.profile.agentId ?? provider.profile.providerId;
    this.providerIdsByAgentId.set(agentId, provider.profile.providerId);
    this.providerHealthCache.delete(provider.profile.providerId);
  }

  private resolveProviderByAgentId(agentId: string): ProviderProfile | undefined {
    const providerId = this.providerIdsByAgentId.get(agentId);
    if (providerId) {
      return this.providers.get(providerId);
    }
    return this.providers.get(agentId);
  }

  /**
   * Register or update a provider. Without `allowTakeover`, refuses to overwrite a
   * different agentId that already owns the same endpoint (or vice-versa collisions).
   */
  async upsertRegisteredProvider(
    input: ProviderRegistrationInput,
    options: { allowTakeover?: boolean } = {}
  ): Promise<ProviderProfile> {
    this.deps.assertPersistenceWritable();
    const byAgent = this.resolveProviderByAgentId(input.agentId);
    const byEndpoint = [...this.providers.values()].find(
      (provider) =>
        normalizeProviderEndpoint(provider.endpoint) === normalizeProviderEndpoint(input.endpoint)
    );

    if (!options.allowTakeover) {
      if (
        byEndpoint &&
        byEndpoint.agentId !== input.agentId &&
        byEndpoint.providerId !== input.agentId &&
        (!byAgent || byAgent.providerId !== byEndpoint.providerId)
      ) {
        throw new ProviderRegistrationConflictError(
          `Endpoint is already registered to provider "${byEndpoint.providerId}".`,
          {
            providerId: byEndpoint.providerId,
            agentId: byEndpoint.agentId,
            reason: 'endpoint',
          }
        );
      }
      if (
        byAgent &&
        byEndpoint &&
        byAgent.providerId !== byEndpoint.providerId &&
        byEndpoint.agentId !== input.agentId
      ) {
        throw new ProviderRegistrationConflictError(
          `Agent id and endpoint resolve to different providers ("${byAgent.providerId}" vs "${byEndpoint.providerId}").`,
          {
            providerId: byEndpoint.providerId,
            agentId: byEndpoint.agentId,
            reason: 'endpoint',
          }
        );
      }
    }

    const existing = byAgent ?? byEndpoint;
    const profile = buildProviderProfileFromRegistration(input, existing);
    profile.status = 'available';
    profile.lastSeenAt = new Date().toISOString();

    this.registerProvider(createProviderFromProfile(profile));
    dropProviderAliases(profile, this.providerRegistryMaps(), { preserveSeededProvider: false });
    await this.deps.queuePersist();
    return profile;
  }

  async recordAgentHeartbeat(input: AgentHeartbeatInput): Promise<ProviderProfile | undefined> {
    this.deps.assertPersistenceWritable();
    this.refreshProviderLiveness();
    const provider = this.resolveProviderByAgentId(input.agentId);

    if (!provider) {
      return undefined;
    }

    provider.status = input.status ?? 'available';
    provider.lastSeenAt = input.timestamp ?? new Date().toISOString();
    refreshProviderScores(provider);
    await this.deps.queuePersist();
    return provider;
  }

  async discoverProviders(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    await this.refreshProviderAvailability();
    return this.filterDiscoverableProviders(query);
  }

  async discoverProvidersForRaid(query: ProviderDiscoveryQuery = {}): Promise<ProviderProfile[]> {
    return discoverProvidersForRaidWithCapacity(query, this.deps.getProviderCapacityDeps());
  }

  selectProvidersForTask(task: SanitizedTaskSpec, providers: ProviderProfile[]): SelectedProviders {
    const selectedProviders = selectProviders(task, providers, this.options.providerFreshMs, {
      skipFreshnessCheck: true,
      roundRobinCursor: this.roundRobinCursor,
    });

    if (selectedProviders.roundRobinCursor !== undefined) {
      this.roundRobinCursor = selectedProviders.roundRobinCursor;
    }

    return selectedProviders;
  }

  filterDiscoverableProviders(query: ProviderDiscoveryQuery = {}): ProviderProfile[] {
    this.refreshProviderLiveness();
    return filterProvidersByDiscoveryQuery(
      this.listProviders(),
      query,
      this.options.providerFreshMs,
      (providerId) => providerHasCapacityForRaid(providerId, this.deps.getProviderCapacityDeps())
    );
  }

  listProviders(): ProviderProfile[] {
    this.refreshProviderLiveness();
    return [...this.providers.values()];
  }

  getProviderProfile(providerId: string): ProviderProfile | undefined {
    this.refreshProviderLiveness();
    return this.providers.get(providerId);
  }

  requireProvider(providerId: string): ProviderProfile {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new InvalidRaidLaunchReservationError(
        `Reserved provider ${providerId} is no longer registered with Mercenary.`
      );
    }
    return provider;
  }

  refreshProviderLiveness(nowMs: number = Date.now()): void {
    refreshProviderLivenessState(this.providers.values(), this.options.providerFreshMs, nowMs);
  }

  async refreshProviderAvailability(): Promise<Set<string>> {
    return refreshProviderAvailabilityState({
      providers: [...this.providers.values()],
      providerHealthCache: this.providerHealthCache,
      providerFreshMs: this.options.providerFreshMs,
    });
  }

  applyProviderRoutingCooldown(providerId: string, cooldownMs = 5 * 60_000): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return;
    }
    provider.routingCooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
    this.providers.set(providerId, provider);
    const runtime = this.providerRuntimes.get(providerId);
    if (runtime) {
      (runtime.profile as ProviderProfile).routingCooldownUntil = provider.routingCooldownUntil;
    }
  }

  /** Drop a provider from the live registry (and persist). Used to retire seed workers. */
  async removeRegisteredProvider(providerId: string): Promise<boolean> {
    const profile = this.providers.get(providerId);
    if (!profile) {
      return false;
    }
    this.deps.assertPersistenceWritable();
    const agentId = profile.agentId ?? providerId;
    this.providers.delete(providerId);
    this.providerRuntimes.delete(providerId);
    this.providerHealthCache.delete(providerId);
    this.seededProviderIds.delete(providerId);
    if (this.providerIdsByAgentId.get(agentId) === providerId) {
      this.providerIdsByAgentId.delete(agentId);
    }
    await this.deps.queuePersist();
    return true;
  }

  updateProviderProfile(providerId: string, update: (profile: ProviderProfile) => void): void {
    const profile = this.providers.get(providerId);
    if (!profile) {
      return;
    }
    update(profile);
    this.providers.set(providerId, profile);
    const runtime = this.providerRuntimes.get(providerId);
    if (runtime) {
      Object.assign(runtime.profile as ProviderProfile, profile);
    }
  }

  providerRegistryMaps(): ProviderRegistryMaps {
    return {
      providers: this.providers,
      providerRuntimes: this.providerRuntimes,
      providerHealthCache: this.providerHealthCache,
      seededProviderIds: this.seededProviderIds,
    };
  }
}
