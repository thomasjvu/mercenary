import {
  FileBossRaidPersistence,
  InMemoryBossRaidPersistence,
  type BossRaidPersistence,
} from '@bossraid/persistence';
import { SqliteBossRaidPersistence } from '@bossraid/persistence-sqlite';

export function createPersistenceBackend(input: {
  storageBackend: 'sqlite' | 'file' | 'memory';
  stateFile?: string;
  sqliteFile?: string;
}): BossRaidPersistence {
  switch (input.storageBackend) {
    case 'sqlite':
      if (!input.sqliteFile) {
        throw new Error('BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.');
      }
      return new SqliteBossRaidPersistence(input.sqliteFile);
    case 'file':
      if (!input.stateFile) {
        throw new Error('BOSSRAID_STATE_FILE is required when BOSSRAID_STORAGE_BACKEND=file.');
      }
      return new FileBossRaidPersistence(input.stateFile);
    case 'memory':
      return new InMemoryBossRaidPersistence();
  }
}
