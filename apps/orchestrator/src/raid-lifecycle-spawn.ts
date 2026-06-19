import type {
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  RaidLaunchReservationRecord,
} from '@bossraid/shared-types';
import {
  computeRootDeadlineUnix,
  createLaunchReservationRecord,
  findReusableLaunchReservation,
  hydrateLaunchReservation,
  launchReservationExpired,
  prepareRaid,
  pruneLaunchReservations as pruneLaunchReservationsState,
  spawnPreparedRaid,
  InvalidRaidLaunchReservationError,
} from './raid-launch.js';
import { assertPreparedProvidersHaveCapacity } from './orchestrator-provider-capacity.js';
import type { ProviderRegistryCoordinator } from './orchestrator-provider-registry.js';
import type { RuntimeOptions } from './runtime.js';

export type LaunchReservationOptions = {
  route: 'raid' | 'chat' | 'inference';
  requestKey: string;
  holdUntilUnix?: number;
};

export type RaidLifecycleSpawnContext = {
  launchReservations: Map<string, RaidLaunchReservationRecord>;
  options: RuntimeOptions;
  assertPersistenceWritable: () => void;
  queuePersist: () => Promise<void>;
  queuePersistBestEffort: () => void;
  providerRegistry: ProviderRegistryCoordinator;
  prepareRaidDeps: () => Parameters<typeof prepareRaid>[1];
  spawnPreparedRaidDeps: () => Parameters<typeof spawnPreparedRaid>[4];
  providerCapacityDeps: () => Parameters<typeof assertPreparedProvidersHaveCapacity>[1];
};

export async function preflightRaid(
  ctx: RaidLifecycleSpawnContext,
  input: BossRaidSpawnInput
): Promise<void> {
  ctx.assertPersistenceWritable();
  await prepareRaid(input, ctx.prepareRaidDeps());
}

export async function reserveRaidLaunch(
  ctx: RaidLifecycleSpawnContext,
  input: BossRaidSpawnInput,
  options: LaunchReservationOptions
): Promise<RaidLaunchReservationRecord> {
  ctx.assertPersistenceWritable();
  pruneLaunchReservations(ctx, true);
  const existing = findReusableLaunchReservation(
    ctx.launchReservations,
    options.route,
    options.requestKey
  );
  if (existing) {
    return existing;
  }

  const prepared = await prepareRaid(input, ctx.prepareRaidDeps());
  assertPreparedProvidersHaveCapacity(prepared, ctx.providerCapacityDeps());
  const deadlineUnix = computeRootDeadlineUnix(prepared.sanitized, ctx.options.raidAbsoluteMs);
  const holdUntilUnix = Math.min(options.holdUntilUnix ?? deadlineUnix, deadlineUnix);
  const record = createLaunchReservationRecord(prepared, {
    route: options.route,
    requestKey: options.requestKey,
    deadlineUnix,
    holdUntilUnix,
  });
  ctx.launchReservations.set(record.id, record);
  await ctx.queuePersist();
  return record;
}

export function getRaidLaunchReservation(
  ctx: RaidLifecycleSpawnContext,
  reservationId: string,
  requestKey: string
): RaidLaunchReservationRecord | undefined {
  pruneLaunchReservations(ctx, true);
  const reservation = ctx.launchReservations.get(reservationId);
  if (!reservation) {
    return undefined;
  }
  if (reservation.requestKey !== requestKey) {
    return undefined;
  }
  if (!reservation.spawnOutput && launchReservationExpired(reservation)) {
    ctx.launchReservations.delete(reservation.id);
    ctx.queuePersistBestEffort();
    return undefined;
  }
  return reservation;
}

export async function spawnReservedRaid(
  ctx: RaidLifecycleSpawnContext,
  reservationId: string,
  requestKey: string,
  escrowFundingUsd?: number,
  platformMarkupUsd?: number
): Promise<BossRaidSpawnOutput> {
  ctx.assertPersistenceWritable();
  const reservation = getRaidLaunchReservation(ctx, reservationId, requestKey);
  if (!reservation) {
    throw new InvalidRaidLaunchReservationError(
      'Raid launch reservation is missing, expired, or does not match this request.'
    );
  }

  if (reservation.spawnOutput) {
    return reservation.spawnOutput;
  }

  if (reservation.deadlineUnix * 1_000 <= Date.now()) {
    ctx.launchReservations.delete(reservation.id);
    await ctx.queuePersist();
    throw new InvalidRaidLaunchReservationError(
      'Raid launch reservation expired before payment completed.'
    );
  }

  const prepared = hydrateLaunchReservation(reservation, (providerId) =>
    ctx.providerRegistry.requireProvider(providerId)
  );
  const spawn = await spawnPreparedRaid(
    prepared,
    reservation.deadlineUnix,
    escrowFundingUsd,
    platformMarkupUsd,
    ctx.spawnPreparedRaidDeps()
  );
  reservation.spawnOutput = spawn;
  await ctx.queuePersist();
  return spawn;
}

export async function spawnRaid(
  ctx: RaidLifecycleSpawnContext,
  input: BossRaidSpawnInput,
  escrowFundingUsd?: number,
  platformMarkupUsd?: number
): Promise<BossRaidSpawnOutput> {
  ctx.assertPersistenceWritable();
  const prepared = await prepareRaid(input, ctx.prepareRaidDeps());
  return spawnPreparedRaid(
    prepared,
    computeRootDeadlineUnix(prepared.sanitized, ctx.options.raidAbsoluteMs),
    escrowFundingUsd,
    platformMarkupUsd,
    ctx.spawnPreparedRaidDeps()
  );
}

export function pruneLaunchReservations(ctx: RaidLifecycleSpawnContext, persist = true): void {
  pruneLaunchReservationsState(ctx.launchReservations, () => ctx.queuePersistBestEffort(), persist);
}
