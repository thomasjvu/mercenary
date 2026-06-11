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

export function getActiveAssignmentCount(
  providerId: string,
  deps: Pick<OrchestratorProviderCapacityDeps, 'raids' | 'launchReservations'>
): number {
  let activeAssignments = 0;

  for (const raid of deps.raids.values()) {
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      continue;
    }

    if (raid.adaptivePlanning?.availableProviderIds.includes(providerId)) {
      activeAssignments += 1;
    }

    const assignment = raid.assignments[providerId];
    if (!assignment || TERMINAL_ASSIGNMENT_STATUSES.has(assignment.status)) {
      continue;
    }

    activeAssignments += 1;
  }

  for (const reservation of deps.launchReservations.values()) {
    if (reservation.spawnOutput || launchReservationExpired(reservation)) {
      continue;
    }
    if (reservation.reservedProviderIds.includes(providerId)) {
      activeAssignments += 1;
    }
  }

  return activeAssignments;
}

export function providerHasCapacity(
  providerId: string,
  deps: OrchestratorProviderCapacityDeps
): boolean {
  const profile = deps.providers.get(providerId);
  if (!profile) {
    return false;
  }

  return getActiveAssignmentCount(providerId, deps) < Math.max(profile.maxConcurrency, 1);
}

export async function discoverProvidersForRaid(
  query: ProviderDiscoveryQuery = {},
  deps: OrchestratorProviderCapacityDeps
): Promise<ProviderProfile[]> {
  const readyProviderIds = await deps.refreshProviderAvailability();
  return filterReadyProvidersForRaid(
    deps.listProviders(),
    readyProviderIds,
    (providerId) => providerHasCapacity(providerId, deps),
    query,
    deps.options
  );
}
