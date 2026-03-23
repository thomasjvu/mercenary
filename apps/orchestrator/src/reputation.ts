import {
  applyReputationDelta,
  createReputationEvent,
} from "@bossraid/raid-core";
import { refreshProviderScores } from "@bossraid/provider-registry";
import type {
  ProviderProfile,
  RaidRecord,
  ReputationEvent,
  ReputationEventType,
} from "@bossraid/shared-types";

export const RAID_VOLUME_EVENT_TYPES = new Set([
  "valid_submission",
  "invalid_submission",
  "invite_timeout",
  "heartbeat_timeout",
]);

export function hasRaidVolumeEventForProvider(
  raid: RaidRecord | undefined,
  providerId: string,
): boolean {
  if (!raid) {
    return false;
  }

  return raid.reputationEvents.some(
    (event) => event.providerId === providerId && RAID_VOLUME_EVENT_TYPES.has(event.type),
  );
}

export function applyReputationEventToProvider(
  provider: ProviderProfile,
  event: ReputationEvent,
  countRaidVolume: boolean,
): void {
  provider.reputation.globalScore = applyReputationDelta(provider.reputation.globalScore, event.delta.global);
  provider.reputation.responsivenessScore = applyReputationDelta(
    provider.reputation.responsivenessScore,
    event.delta.responsiveness,
  );
  provider.reputation.validityScore = applyReputationDelta(
    provider.reputation.validityScore,
    event.delta.validity,
  );
  provider.reputation.qualityScore = applyReputationDelta(
    provider.reputation.qualityScore,
    event.delta.quality,
  );

  if (countRaidVolume) {
    provider.reputation.totalRaids += 1;
  }

  if (event.type === "successful_provider") {
    provider.reputation.totalSuccessfulRaids += 1;
  }

  refreshProviderScores(provider);
}

export function createProviderReputationEvent(
  providerId: string,
  type: ReputationEventType,
  context?: Record<string, unknown>,
): ReputationEvent {
  return createReputationEvent(providerId, type, context);
}
