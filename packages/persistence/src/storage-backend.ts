export type StorageBackendKind = 'sqlite' | 'file' | 'memory';

export type StorageBackendFactories<T> = {
  memory: () => T;
  file: (stateFile: string) => T;
  sqlite: (sqliteFile: string) => T;
};

export function createStorageBackend<T>(
  backend: StorageBackendKind,
  factories: StorageBackendFactories<T>,
  paths: { stateFile?: string; sqliteFile?: string }
): T {
  switch (backend) {
    case 'sqlite':
      if (!paths.sqliteFile) {
        throw new Error('BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.');
      }
      return factories.sqlite(paths.sqliteFile);
    case 'file':
      if (!paths.stateFile) {
        throw new Error('BOSSRAID_STATE_FILE is required when BOSSRAID_STORAGE_BACKEND=file.');
      }
      return factories.file(paths.stateFile);
    case 'memory':
      return factories.memory();
  }
}
