import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  ProviderDiscoveryQuery,
  ProviderProfile,
  RaidRecord,
  ReputationEventType,
  SanitizedTaskSpec,
} from '@bossraid/shared-types';
import { maybeReplanHierarchicalRaid } from './raid-adaptive.js';
import type { PreparedRaidNode } from './raid-launch.js';
import { instantiatePreparedChildren } from './raid-launch.js';
import type { RaidProviderDispatchDeps } from './raid-provider-dispatch.js';
import type { ProviderTimerRegistry } from './timer-registry.js';
import type { RuntimeOptions } from './runtime.js';

export type RaidRunnerContext = {
  requireRaid: (raidId: string) => RaidRecord;
  getProvider: (providerId: string) => ProviderProfile | undefined;
  getProviderRuntime: (providerId: string) => RaidProvider | undefined;
  updateProviderProfile: (providerId: string, update: (profile: ProviderProfile) => void) => void;
  options: RuntimeOptions;
  timers: ProviderTimerRegistry;
  raids: Map<string, RaidRecord>;
  providers: Map<string, ProviderProfile>;
  clearProviderTimers: (raidId: string, providerId: string) => void;
  queuePersistBestEffort: () => void;
  queuePersist: () => Promise<void>;
  raidDeadlineReached: (raid: RaidRecord) => boolean;
  expireRaidAtDeadline: (raidId: string) => void;
  scheduleRaidDeadline: (raidId: string) => void;
  refreshRaidAncestry: (raidId: string | undefined) => void;
  maybeFinalizeAfterUpdate: (raidId: string) => void;
  applyReputationEvent: (
    providerId: string,
    type: ReputationEventType,
    context?: Record<string, unknown>
  ) => void;
  applyProviderRoutingCooldown: (providerId: string, cooldownMs?: number) => void;
  finalizeRaid: (raid: RaidRecord) => void;
  shouldFinalizeHierarchicalRaid: (raid: RaidRecord) => boolean;
  waitForFinalization: (raidId: string) => Promise<void>;
  runRaid: (raidId: string) => void;
  discoverProvidersForRaid: (query?: ProviderDiscoveryQuery) => Promise<ProviderProfile[]>;
  selectProvidersForTask: (
    task: SanitizedTaskSpec,
    providers: ProviderProfile[]
  ) => import('@bossraid/shared-types').SelectedProviders;
  instantiatePreparedChildrenDeps: () => {
    raids: Map<string, RaidRecord>;
    requireRaid: (raidId: string) => RaidRecord;
    scheduleRaidDeadline: (raidId: string) => void;
  };
};

export function buildRaidProviderDispatchDeps(
  context: RaidRunnerContext
): RaidProviderDispatchDeps {
  return {
    requireRaid: (raidId) => context.requireRaid(raidId),
    getProvider: (providerId) => context.getProvider(providerId),
    getProviderRuntime: (providerId) => context.getProviderRuntime(providerId),
    updateProviderProfile: (providerId, update) =>
      context.updateProviderProfile(providerId, update),
    options: context.options,
    timers: context.timers,
    clearProviderTimers: (raidId, providerId) => context.clearProviderTimers(raidId, providerId),
    queuePersistBestEffort: () => context.queuePersistBestEffort(),
    raidDeadlineReached: (raid) => context.raidDeadlineReached(raid),
    expireRaidAtDeadline: (raidId) => context.expireRaidAtDeadline(raidId),
    scheduleRaidDeadline: (raidId) => context.scheduleRaidDeadline(raidId),
    refreshRaidAncestry: (raidId) => context.refreshRaidAncestry(raidId),
    maybeFinalizeAfterUpdate: (raidId) => context.maybeFinalizeAfterUpdate(raidId),
    applyReputationEvent: (providerId, type, reputationContext) =>
      context.applyReputationEvent(providerId, type, reputationContext),
    applyProviderRoutingCooldown: (providerId, cooldownMs) =>
      context.applyProviderRoutingCooldown(providerId, cooldownMs),
    finalizeRaid: (raid) => context.finalizeRaid(raid),
    maybeReplanHierarchicalRaid: (raidId) =>
      maybeReplanHierarchicalRaid(raidId, buildAdaptiveReplanDeps(context)),
    shouldFinalizeHierarchicalRaid: (raid) => context.shouldFinalizeHierarchicalRaid(raid),
    waitForFinalization: (raidId) => context.waitForFinalization(raidId),
  };
}

export function buildAdaptiveReplanDeps(context: RaidRunnerContext) {
  return {
    raids: context.raids,
    providers: context.providers,
    requireRaid: (raidId: string) => context.requireRaid(raidId),
    queuePersistBestEffort: () => context.queuePersistBestEffort(),
    scheduleRaidDeadline: (raidId: string) => context.scheduleRaidDeadline(raidId),
    runRaid: (raidId: string) => {
      context.runRaid(raidId);
    },
    raidDeadlineReached: (raid: RaidRecord) => context.raidDeadlineReached(raid),
    instantiatePreparedChildrenDeps: () => context.instantiatePreparedChildrenDeps(),
  };
}

export function buildSpawnPreparedRaidDeps(context: RaidRunnerContext) {
  return {
    raids: context.raids,
    scheduleRaidDeadline: (raidId: string) => context.scheduleRaidDeadline(raidId),
    instantiatePreparedChildren: (
      parentRaidId: string,
      children: PreparedRaidNode[],
      deadlineUnix: number
    ) =>
      instantiatePreparedChildren(
        parentRaidId,
        children,
        deadlineUnix,
        context.instantiatePreparedChildrenDeps()
      ),
    queuePersist: () => context.queuePersist(),
    runRaid: (raidId: string) => {
      context.runRaid(raidId);
    },
  };
}

export function buildPrepareRaidDeps(context: RaidRunnerContext) {
  return {
    discoverProvidersForRaid: (query?: ProviderDiscoveryQuery) =>
      context.discoverProvidersForRaid(query),
    selectProvidersForTask: (task: SanitizedTaskSpec, providers: ProviderProfile[]) =>
      context.selectProvidersForTask(task, providers),
  };
}
