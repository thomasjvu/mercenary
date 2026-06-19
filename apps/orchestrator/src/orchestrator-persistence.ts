import { createProviderFromProfile, type RaidProvider } from '@bossraid/provider-sdk';
import { refreshProviderScores } from '@bossraid/provider-registry';
import type { BossRaidPersistence, SecretCipher } from '@bossraid/persistence';
import type {
  BossRaidPersistenceSnapshot,
  ProviderProfile,
  RaidLaunchReservationRecord,
  RaidRecord,
} from '@bossraid/shared-types';
import { restorePersistedRaid, TERMINAL_RAID_STATUSES } from './raid-state.js';
import {
  decryptProviderProfileSecrets,
  dropProviderAliases,
  encryptProviderProfileSecrets,
  normalizeProviderEndpoint,
} from './provider-registry-local.js';
import { launchReservationExpired } from './raid-launch.js';
import { refreshParentRaidFromChildren } from './raid-hierarchy.js';
import type { PersistenceQueue } from './persistence-queue.js';
import { pruneTerminalRaidsForRetention } from './raid-retention.js';

export type ProviderRegistryMaps = {
  providers: Map<string, ProviderProfile>;
  providerRuntimes: Map<string, RaidProvider>;
  providerHealthCache: { delete: (providerId: string) => void };
  seededProviderIds: Set<string>;
};

export type RestoreOrchestratorStateInput = {
  snapshot: BossRaidPersistenceSnapshot;
  secretCipher: SecretCipher;
  providerRegistryMaps: () => ProviderRegistryMaps;
  registerProvider: (provider: RaidProvider) => void;
  raids: Map<string, RaidRecord>;
  launchReservations: Map<string, RaidLaunchReservationRecord>;
  listAllRaids: () => RaidRecord[];
  requireRaid: (raidId: string) => RaidRecord;
  scheduleRaidDeadline: (raidId: string) => void;
  pruneLaunchReservations: (persist?: boolean) => void;
  refreshProviderLiveness: (nowMs?: number) => void;
};

export function buildOrchestratorSnapshot(input: {
  listAllRaids: () => RaidRecord[];
  listProviders: () => ProviderProfile[];
  launchReservations: Map<string, RaidLaunchReservationRecord>;
  secretCipher: SecretCipher;
  refreshProviderLiveness: (nowMs?: number) => void;
  pruneLaunchReservations: (persist?: boolean) => void;
  raidRetentionTtlMs?: number;
  dropRaids?: (raidIds: string[]) => void;
}): BossRaidPersistenceSnapshot {
  input.refreshProviderLiveness();
  input.pruneLaunchReservations(false);

  let raids = input.listAllRaids();
  if (input.raidRetentionTtlMs != null && input.raidRetentionTtlMs > 0) {
    const retention = pruneTerminalRaidsForRetention(raids, {
      ttlMs: input.raidRetentionTtlMs,
    });
    if (retention.prunedRaidIds.length > 0) {
      input.dropRaids?.(retention.prunedRaidIds);
    }
    raids = retention.raids;
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    raids,
    providers: input
      .listProviders()
      .map((provider) => encryptProviderProfileSecrets(provider, input.secretCipher)),
    launchReservations: [...input.launchReservations.values()],
  };
}

export function restoreOrchestratorState(input: RestoreOrchestratorStateInput): boolean {
  let normalized = false;
  const registryMaps = input.providerRegistryMaps();

  for (const persistedSnapshot of input.snapshot.providers) {
    const persisted = decryptProviderProfileSecrets(persistedSnapshot, input.secretCipher);
    const existing =
      registryMaps.providers.get(persisted.providerId) ??
      (persisted.agentId
        ? [...registryMaps.providers.values()].find(
            (provider) => provider.agentId === persisted.agentId
          )
        : undefined) ??
      [...registryMaps.providers.values()].find(
        (provider) =>
          normalizeProviderEndpoint(provider.endpoint) ===
          normalizeProviderEndpoint(persisted.endpoint)
      );
    if (!existing) {
      input.registerProvider(createProviderFromProfile(persisted));
      continue;
    }

    if (existing.providerId !== persisted.providerId) {
      normalized = true;
    }

    existing.status = persisted.status;
    existing.reputation = persisted.reputation;
    existing.privacy = persisted.privacy;
    existing.modelFamily = persisted.modelFamily;
    existing.outputTypes = persisted.outputTypes;
    existing.auth = persisted.auth;
    existing.lastSeenAt = persisted.lastSeenAt;
    refreshProviderScores(existing);
    normalized =
      dropProviderAliases(existing, registryMaps, {
        preserveSeededProvider: true,
      }) || normalized;
  }

  for (const raid of input.snapshot.raids) {
    const restored = restorePersistedRaid(raid);
    input.raids.set(restored.id, restored);
    if (!TERMINAL_RAID_STATUSES.has(restored.status)) {
      input.scheduleRaidDeadline(restored.id);
    }
  }

  for (const reservation of input.snapshot.launchReservations ?? []) {
    if (reservation.spawnOutput || !launchReservationExpired(reservation)) {
      input.launchReservations.set(reservation.id, reservation);
    }
  }

  for (const raid of input.listAllRaids()) {
    if (raid.parentRaidId == null && raid.childRaidIds?.length) {
      refreshParentRaidFromChildren(raid.id, (childRaidId) => input.requireRaid(childRaidId));
    }
  }

  input.pruneLaunchReservations();
  return normalized;
}

export function queueOrchestratorPersist(
  persistenceQueue: PersistenceQueue,
  persistence: BossRaidPersistence,
  snapshot: () => BossRaidPersistenceSnapshot
): Promise<void> {
  return persistenceQueue.enqueue(() => persistence.saveState(snapshot()));
}

const debouncedBestEffortPersist = new WeakMap<PersistenceQueue, BestEffortPersistState>();

type BestEffortPersistState = {
  timer?: ReturnType<typeof setTimeout>;
  delayMs: number;
  dirty: boolean;
};

export function queueOrchestratorPersistBestEffort(
  persistenceQueue: PersistenceQueue,
  persistence: BossRaidPersistence,
  snapshot: () => BossRaidPersistenceSnapshot,
  debounceMs = 1_000
): void {
  let state = debouncedBestEffortPersist.get(persistenceQueue) as
    | BestEffortPersistState
    | undefined;
  if (!state) {
    state = { delayMs: debounceMs, dirty: false };
    debouncedBestEffortPersist.set(persistenceQueue, state);
  }

  state.dirty = true;

  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => {
    state!.timer = undefined;
    if (!state!.dirty) {
      return;
    }
    state!.dirty = false;
    persistenceQueue.enqueueBestEffort(() => persistence.saveState(snapshot()));
  }, state.delayMs);
  state.timer.unref?.();
}
