export type StorageBackendKind = 'sqlite' | 'memory' | 'postgres';

export type StorageBackendFactories<T> = {
  memory: () => T;
  sqlite: (sqliteFile: string) => T;
  postgres?: (databaseUrl: string) => T;
};

export function createStorageBackend<T>(
  backend: StorageBackendKind,
  factories: StorageBackendFactories<T>,
  paths: { sqliteFile?: string; databaseUrl?: string }
): T {
  switch (backend) {
    case 'sqlite':
      if (!paths.sqliteFile) {
        throw new Error('BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.');
      }
      return factories.sqlite(paths.sqliteFile);
    case 'postgres':
      if (!factories.postgres) {
        throw new Error('Postgres storage factory is not registered for this store.');
      }
      if (!paths.databaseUrl) {
        throw new Error(
          'BOSSRAID_DATABASE_URL is required when BOSSRAID_STORAGE_BACKEND=postgres.'
        );
      }
      return factories.postgres(paths.databaseUrl);
    case 'memory':
      return factories.memory();
  }
}
