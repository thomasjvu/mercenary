import type { RaidRecord } from '@bossraid/shared-types';
import { TERMINAL_RAID_STATUSES } from './raid-state.js';

export class RaidDeadlineTimerRegistry {
  private readonly raidDeadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly expiringRaids = new Set<string>();

  schedule(raidId: string, raid: RaidRecord, onExpire: (raidId: string) => void): void {
    this.clear(raidId);
    if (TERMINAL_RAID_STATUSES.has(raid.status)) {
      return;
    }

    const delayMs = raid.deadlineUnix * 1_000 - Date.now();
    if (delayMs <= 0) {
      queueMicrotask(() => onExpire(raidId));
      return;
    }

    const timer = setTimeout(() => {
      onExpire(raidId);
    }, delayMs);
    this.raidDeadlineTimers.set(raidId, timer);
  }

  clear(raidId: string): void {
    const timer = this.raidDeadlineTimers.get(raidId);
    if (timer) {
      clearTimeout(timer);
      this.raidDeadlineTimers.delete(raidId);
    }
  }

  isExpiring(raidId: string): boolean {
    return this.expiringRaids.has(raidId);
  }

  tryMarkExpiring(raidId: string): boolean {
    if (this.expiringRaids.has(raidId)) {
      return false;
    }
    this.expiringRaids.add(raidId);
    return true;
  }

  unmarkExpiring(raidId: string): void {
    this.expiringRaids.delete(raidId);
  }

  static deadlineReached(raid: RaidRecord): boolean {
    return raid.deadlineUnix * 1_000 <= Date.now();
  }
}
