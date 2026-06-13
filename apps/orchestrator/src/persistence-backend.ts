import {
  InMemoryBossRaidPersistence,
  createStorageBackend,
  type BossRaidPersistence,
} from '@bossraid/persistence';
import { SqliteBossRaidPersistence } from '@bossraid/persistence-sqlite';

export function createPersistenceBackend(input: {
  storageBackend: 'sqlite' | 'memory';
  sqliteFile?: string;
}): BossRaidPersistence {
  return createStorageBackend<BossRaidPersistence>(
    input.storageBackend,
    {
      memory: () => new InMemoryBossRaidPersistence(),
      sqlite: (sqliteFile) => new SqliteBossRaidPersistence(sqliteFile),
    },
    {
      sqliteFile: input.sqliteFile,
    }
  );
}
