export type StorageBackend = 'sqlite' | 'file' | 'memory';

export type ReadStorageBackendOptions = {
  strict?: boolean;
  isolateNonProcessEnv?: boolean;
};

export function readStorageBackend(
  env: NodeJS.ProcessEnv,
  options: ReadStorageBackendOptions = {}
): StorageBackend {
  const { strict = false, isolateNonProcessEnv = false } = options;
  const configured = env.BOSSRAID_STORAGE_BACKEND;
  if (configured === 'sqlite' || configured === 'file' || configured === 'memory') {
    return configured;
  }

  if (configured != null && strict) {
    throw new Error('BOSSRAID_STORAGE_BACKEND must be sqlite, file, or memory.');
  }

  if (isolateNonProcessEnv && env !== process.env) {
    return 'memory';
  }

  return env.BOSSRAID_STATE_FILE ? 'file' : 'sqlite';
}
