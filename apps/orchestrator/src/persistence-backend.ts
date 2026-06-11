import {
  FileBossRaidPersistence,
  InMemoryBossRaidPersistence,
  createStorageBackend,
  type BossRaidPersistence,
} from '@bossraid/persistence';
import { SqliteBossRaidPersistence } from '@bossraid/persistence-sqlite';

export function createPersistenceBackend(input: {
  storageBackend: 'sqlite' | 'file' | 'memory';
  stateFile?: string;
  sqliteFile?: string;
}): BossRaidPersistence {
  return createStorageBackend<BossRaidPersistence>(
    input.storageBackend,
    {
      memory: () => new InMemoryBossRaidPersistence(),
      file: (stateFile) => new FileBossRaidPersistence(stateFile),
      sqlite: (sqliteFile) => new SqliteBossRaidPersistence(sqliteFile),
    },
    {
      stateFile: input.stateFile,
      sqliteFile: input.sqliteFile,
    }
  );
}
