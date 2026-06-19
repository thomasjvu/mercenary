import type {
  ProviderDiscoveryQuery,
  ProviderProfile,
  RaidLaunchReservationRecord,
  RaidRecord,
} from '@bossraid/shared-types';
import { filterReadyProvidersForRaid } from './orchestrator-provider-lifecycle.js';
import { launchReservationExpired } from './raid-launch.js';
import { TERMINAL_ASSIGNMENT_STATUSES, TERMINAL_RAID_STATUSES } from './raid-state.js';
import type { RuntimeOptions } from './runtime.js';

export type OrchestratorProviderCapacityDeps = {
  raids: Map<string, RaidRecord>;
  launchReservations: Map<string, RaidLaunchReservationRecord>;
  providers: Map<string, ProviderProfile>;
  listProviders: () => ProviderProfile[];
  refreshProviderAvailability: () => Promise<Set<string>>;
  options: RuntimeOptions;
};

export function buildActiveAssignmentCounts(
  deps: Pick<OrchestratorProviderCapacityDeps, 'raids' | 'launchReservations'>
): Map<string, number> {
  const counts = new Map<string, number>();
  const increment = (providerId: string) => {
    counts.set(providerId, (counts.get(providerId) ?? 0) + 1);
  };

  for (const raid of deps.raids.values()) {
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      continue;
    }

    if (raid.adaptivePlanning?.availableProviderIds) {
      for (const providerId of raid.adaptivePlanning.availableProviderIds) {
        increment(providerId);
      }
    }

    for (const [providerId, assignment] of Object.entries(raid.assignments)) {
      if (TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
        continue;
      }
      increment(providerId);
    }
  }

  for (const reservation of deps.launchReservations.values()) {
    if (reservation.spawnOutput || launchReservationExpired(reservation)) {
      continue;
    }
    for (const providerId of reservation.reservedProviderIds) {
      increment(providerId);
    }
  }

  return counts;
}

export function getActiveAssignmentCount(
  providerId: string,
  deps: Pick<OrchestratorProviderCapacityDeps, 'raids' | 'launchReservations'>,
  counts?: Map<string, number>
): number {
  return (counts ?? buildActiveAssignmentCounts(deps)).get(providerId) ?? 0;
}

export function providerHasCapacity(
  providerId: string,
  deps: OrchestratorProviderCapacityDeps,
  counts?: Map<string, number>
): boolean {
  const profile = deps.providers.get(providerId);
  if (!profile) {
    return false;
  }

  return getActiveAssignmentCount(providerId, deps, counts) < Math.max(profile.maxConcurrency, 1);
}

export async function discoverProvidersForRaid(
  query: ProviderDiscoveryQuery = {},
  deps: OrchestratorProviderCapacityDeps
): Promise<ProviderProfile[]> {
  const readyProviderIds = await deps.refreshProviderAvailability();
  const activeAssignmentCounts = buildActiveAssignmentCounts(deps);
  return filterReadyProvidersForRaid(
    deps.listProviders(),
    readyProviderIds,
    (providerId) => providerHasCapacity(providerId, deps, activeAssignmentCounts),
    query,
    deps.options
  );
}
