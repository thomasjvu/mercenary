import { readDatabaseUrl } from '@bossraid/constants';
import {
  InMemoryBossRaidPersistence,
  createStorageBackend,
  type BossRaidPersistence,
  type StorageBackendKind,
} from '@bossraid/persistence';
import { PostgresBossRaidPersistence } from '@bossraid/persistence-postgres';
import { SqliteBossRaidPersistence } from '@bossraid/persistence-sqlite';

export function createPersistenceBackend(input: {
  storageBackend: StorageBackendKind;
  sqliteFile?: string;
  databaseUrl?: string;
}): BossRaidPersistence {
  return createStorageBackend<BossRaidPersistence>(
    input.storageBackend,
    {
      memory: () => new InMemoryBossRaidPersistence(),
      sqlite: (sqliteFile) => new SqliteBossRaidPersistence(sqliteFile),
      postgres: (databaseUrl) => new PostgresBossRaidPersistence(databaseUrl),
    },
    {
      sqliteFile: input.sqliteFile,
      databaseUrl: input.databaseUrl ?? readDatabaseUrl(),
    }
  );
}
