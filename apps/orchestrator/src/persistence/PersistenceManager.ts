import type { BossRaidPersistence } from '@bossraid/persistence';
import type {
  BossRaidPersistenceSnapshot,
  RaidRecord,
  RaidLaunchReservationRecord,
} from '@bossraid/shared-types';

export class PersistenceManager {
  private persistence: BossRaidPersistence;
  private persistenceQueue: Promise<void> = Promise.resolve();
  private lastPersistenceError?: Error;

  constructor(persistence: BossRaidPersistence) {
    this.persistence = persistence;
  }

  assertPersistenceWritable(): void {
    if (!this.persistence) {
      throw new Error('Persistence is not available');
    }
  }

  async queuePersist(): Promise<void> {
    this.persistenceQueue = this.persistenceQueue.then(async () => {
      try {
        // Placeholder for actual persistence logic
        // In a real implementation, this would save state to disk
        // await this.persistence.save(/* snapshot */);
      } catch (error) {
        this.lastPersistenceError = error as Error;
        throw error;
      }
    });
    return this.persistenceQueue;
  }

  async getRaid(raidId: string): Promise<RaidRecord | undefined> {
    // Placeholder: actual implementation would call persistence.loadState and find the raid
    return undefined;
  }

  async saveRaid(raid: RaidRecord): Promise<void> {
    await this.queuePersist();
  }

  async deleteRaid(raidId: string): Promise<void> {
    await this.queuePersist();
  }

  async getLaunchReservation(
    reservationId: string
  ): Promise<RaidLaunchReservationRecord | undefined> {
    // Placeholder: actual implementation would call persistence.loadState and find the reservation
    return undefined;
  }

  async saveLaunchReservation(reservation: RaidLaunchReservationRecord): Promise<void> {
    await this.queuePersist();
  }

  async deleteLaunchReservation(reservationId: string): Promise<void> {
    await this.queuePersist();
  }

  async takeSnapshot(): Promise<BossRaidPersistenceSnapshot> {
    // Placeholder: actual implementation would call persistence.loadState
    // For now, returning empty snapshot
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      raids: [],
      providers: [],
      launchReservations: [],
    };
  }

  async applySnapshot(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    await this.queuePersist();
  }

  getLastPersistenceError(): Error | undefined {
    return this.lastPersistenceError;
  }
}
