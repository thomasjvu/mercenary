import type { BossRaidPersistenceSnapshot } from '@bossraid/shared-types';
export {
  createStorageBackend,
  type StorageBackendFactories,
  type StorageBackendKind,
} from './storage-backend.js';
export { createSecretCipher, isEncryptedSecretValue } from './secret-encryption.js';
export type { SecretCipher } from './secret-encryption.js';

export interface BossRaidPersistence {
  loadState(): Promise<BossRaidPersistenceSnapshot>;
  saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void>;
}

export function createEmptyPersistenceSnapshot(): BossRaidPersistenceSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [],
    launchReservations: [],
  };
}

export class InMemoryBossRaidPersistence implements BossRaidPersistence {
  private snapshot = createEmptyPersistenceSnapshot();

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    return this.snapshot;
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}
