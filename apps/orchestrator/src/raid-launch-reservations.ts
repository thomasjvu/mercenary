import { createHash, randomBytes } from 'node:crypto';
import { TIMEOUTS } from '@bossraid/constants';
import { providerHasPrivacyFeature } from '@bossraid/provider-registry';
import { buildRaidQuoteSnapshot, readProviderPricing } from '@bossraid/raid-core';
import type {
  ProviderProfile,
  RaidLaunchReservationRecord,
  RaidQuoteSnapshot,
  ReservedRaidNode,
  ReservedSelectedProviders,
  SelectedProviders,
} from '@bossraid/shared-types';
import type {
  PreparedHierarchicalRaid,
  PreparedLeafRaid,
  PreparedRaidNode,
} from './raid-launch.js';

export const STALE_RESERVATION_TIMEOUT_MS = TIMEOUTS.STALE_RESERVATION;

export class InvalidRaidLaunchReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRaidLaunchReservationError';
  }
}

export type LaunchReservationOptions = {
  route: 'raid' | 'chat';
  requestKey: string;
  holdUntilUnix?: number;
};

export function launchReservationExpired(reservation: RaidLaunchReservationRecord): boolean {
  return Date.parse(reservation.expiresAt) <= Date.now();
}

export function findReusableLaunchReservation(
  launchReservations: Map<string, RaidLaunchReservationRecord>,
  route: RaidLaunchReservationRecord['route'],
  requestKey: string
): RaidLaunchReservationRecord | undefined {
  return [...launchReservations.values()].find(
    (reservation) =>
      reservation.route === route &&
      reservation.requestKey === requestKey &&
      reservation.spawnOutput == null &&
      !launchReservationExpired(reservation)
  );
}

export function pruneLaunchReservations(
  launchReservations: Map<string, RaidLaunchReservationRecord>,
  onChanged: () => void,
  persist = true
): void {
  const nowMs = Date.now();
  let changed = false;

  for (const [reservationId, reservation] of launchReservations.entries()) {
    const staleReplay =
      reservation.spawnOutput != null &&
      Date.parse(reservation.createdAt) + STALE_RESERVATION_TIMEOUT_MS <= nowMs;
    const expired = reservation.spawnOutput == null && Date.parse(reservation.expiresAt) <= nowMs;
    if (!expired && !staleReplay) {
      continue;
    }

    launchReservations.delete(reservationId);
    changed = true;
  }

  if (changed && persist) {
    onChanged();
  }
}

export function toReservedSelectedProviders(
  selectedProviders: SelectedProviders
): ReservedSelectedProviders {
  return {
    primaries: selectedProviders.primaries.map((provider) => provider.providerId),
    reserves: selectedProviders.reserves.map((provider) => provider.providerId),
  };
}

export function assertQuoteSnapshotStillValid(
  quoteSnapshot: RaidQuoteSnapshot,
  selectedProviders: SelectedProviders
): void {
  const currentProviders = new Map(
    [...selectedProviders.primaries, ...selectedProviders.reserves].map((provider) => [
      provider.providerId,
      provider,
    ])
  );

  for (const snapshot of quoteSnapshot.providers) {
    const current = currentProviders.get(snapshot.providerId);
    if (!current) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} is no longer selected.`
      );
    }
    const endpointHash = createHash('sha256').update(current.endpoint).digest('hex');
    if (endpointHash !== snapshot.endpointHash) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} changed endpoint before execution.`
      );
    }
    if (readProviderPricing(current).rateCardHash !== snapshot.rateCard.rateCardHash) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} changed its rate card before execution.`
      );
    }
    if (
      quoteSnapshot.requiredVerificationStatus &&
      current.verification?.status !== quoteSnapshot.requiredVerificationStatus
    ) {
      throw new InvalidRaidLaunchReservationError(
        `Quoted provider ${snapshot.providerId} no longer satisfies verification requirements.`
      );
    }
    for (const feature of quoteSnapshot.requiredPrivacyFeatures) {
      if (!providerHasPrivacyFeature(current, feature)) {
        throw new InvalidRaidLaunchReservationError(
          `Quoted provider ${snapshot.providerId} no longer satisfies privacy feature ${feature}.`
        );
      }
    }
  }
}

export function fromReservedSelectedProviders(
  selectedProviders: ReservedSelectedProviders,
  requireProvider: (providerId: string) => ProviderProfile,
  quoteSnapshot?: RaidQuoteSnapshot
): SelectedProviders {
  const selected = {
    primaries: selectedProviders.primaries.map((providerId) => requireProvider(providerId)),
    reserves: selectedProviders.reserves.map((providerId) => requireProvider(providerId)),
  };

  if (quoteSnapshot) {
    assertQuoteSnapshotStillValid(quoteSnapshot, selected);
  }

  return selected;
}

export function toReservedRaidNode(
  node: PreparedRaidNode,
  toReservedProviders: (selectedProviders: SelectedProviders) => ReservedSelectedProviders
): ReservedRaidNode {
  return {
    task: node.task,
    contributionPlan: node.contributionPlan,
    selectedProviders: node.selectedProviders
      ? toReservedProviders(node.selectedProviders)
      : undefined,
    children: node.children?.map((child) => toReservedRaidNode(child, toReservedProviders)),
  };
}

export function fromReservedRaidNode(
  node: ReservedRaidNode,
  fromReservedProviders: (
    selectedProviders: ReservedSelectedProviders,
    quoteSnapshot?: RaidQuoteSnapshot
  ) => SelectedProviders
): PreparedRaidNode {
  return {
    task: node.task,
    contributionPlan: node.contributionPlan,
    selectedProviders: node.selectedProviders
      ? fromReservedProviders(node.selectedProviders)
      : undefined,
    children: node.children?.map((child) => fromReservedRaidNode(child, fromReservedProviders)),
  };
}

export function collectPreparedProviderIds(node: PreparedRaidNode): Set<string> {
  const providerIds = new Set<string>();

  const visit = (current: PreparedRaidNode): void => {
    for (const provider of current.selectedProviders?.primaries ?? []) {
      providerIds.add(provider.providerId);
    }
    for (const provider of current.selectedProviders?.reserves ?? []) {
      providerIds.add(provider.providerId);
    }
    for (const child of current.children ?? []) {
      visit(child);
    }
  };

  visit(node);
  return providerIds;
}

export function countPreparedExperts(node: PreparedRaidNode, mode: 'selected' | 'reserve'): number {
  if (node.children?.length) {
    return node.children.reduce((sum, child) => sum + countPreparedExperts(child, mode), 0);
  }

  if (!node.selectedProviders) {
    return 0;
  }

  return mode === 'selected'
    ? node.selectedProviders.primaries.length
    : node.selectedProviders.reserves.length;
}

export function createLaunchReservationRecord(
  prepared: PreparedLeafRaid | PreparedHierarchicalRaid,
  options: {
    route: RaidLaunchReservationRecord['route'];
    requestKey: string;
    deadlineUnix: number;
    holdUntilUnix: number;
  }
): RaidLaunchReservationRecord {
  const expiresAt = new Date(options.holdUntilUnix * 1_000).toISOString();
  const reservedProviderIds = [
    ...new Set(
      prepared.mode === 'hierarchical'
        ? [...collectPreparedProviderIds(prepared.graph), ...prepared.adaptiveProviderIds]
        : [
            ...prepared.selectedProviders.primaries.map((provider) => provider.providerId),
            ...prepared.selectedProviders.reserves.map((provider) => provider.providerId),
          ]
    ),
  ];

  return {
    id: `reservation_${randomBytes(12).toString('hex')}`,
    route: options.route,
    requestKey: options.requestKey,
    createdAt: new Date().toISOString(),
    expiresAt,
    paymentTimeoutSeconds: Math.max(1, options.holdUntilUnix - Math.floor(Date.now() / 1_000)),
    deadlineUnix: options.deadlineUnix,
    mode: prepared.mode,
    sanitized: prepared.sanitized,
    selectedProviders:
      prepared.mode === 'single'
        ? toReservedSelectedProviders(prepared.selectedProviders)
        : undefined,
    quoteSnapshot:
      prepared.mode === 'single'
        ? buildRaidQuoteSnapshot(prepared.sanitized, prepared.selectedProviders, { expiresAt })
        : undefined,
    graph:
      prepared.mode === 'hierarchical'
        ? toReservedRaidNode(prepared.graph, toReservedSelectedProviders)
        : undefined,
    adaptiveProviderIds:
      prepared.mode === 'hierarchical' ? [...prepared.adaptiveProviderIds] : undefined,
    reservedProviderIds,
  };
}

export function hydrateLaunchReservation(
  reservation: RaidLaunchReservationRecord,
  requireProvider: (providerId: string) => ProviderProfile
): PreparedLeafRaid | PreparedHierarchicalRaid {
  const fromReservedProviders = (
    selectedProviders: ReservedSelectedProviders,
    quoteSnapshot?: RaidQuoteSnapshot
  ) => fromReservedSelectedProviders(selectedProviders, requireProvider, quoteSnapshot);

  if (reservation.mode === 'single') {
    if (!reservation.selectedProviders) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} is missing its selected provider set.`
      );
    }

    return {
      mode: 'single',
      sanitized: reservation.sanitized,
      selectedProviders: fromReservedProviders(
        reservation.selectedProviders,
        reservation.quoteSnapshot
      ),
    };
  }

  if (!reservation.graph) {
    throw new InvalidRaidLaunchReservationError(
      `Raid launch reservation ${reservation.id} is missing its hierarchical graph.`
    );
  }

  return {
    mode: 'hierarchical',
    sanitized: reservation.sanitized,
    graph: fromReservedRaidNode(reservation.graph, fromReservedProviders),
    adaptiveProviderIds: [...(reservation.adaptiveProviderIds ?? [])],
  };
}
