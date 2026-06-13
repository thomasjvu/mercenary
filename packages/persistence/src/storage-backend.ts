export type StorageBackendKind = 'sqlite' | 'memory';

export type StorageBackendFactories<T> = {
  memory: () => T;
  sqlite: (sqliteFile: string) => T;
};

export function createStorageBackend<T>(
  backend: StorageBackendKind,
  factories: StorageBackendFactories<T>,
  paths: { sqliteFile?: string }
): T {
  switch (backend) {
    case 'sqlite':
      if (!paths.sqliteFile) {
        throw new Error('BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.');
      }
      return factories.sqlite(paths.sqliteFile);
    case 'memory':
      return factories.memory();
  }
}
