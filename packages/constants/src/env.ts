export function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

export function readBooleanEnv(value: string | undefined): boolean {
  return parseBoolean(value);
}

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readPositiveNumber(value: string | undefined): number | undefined;
export function readPositiveNumber(value: string | undefined, fallback: number): number;
export function readPositiveNumber(
  value: string | undefined,
  fallback?: number
): number | undefined {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

export type StorageBackend = 'sqlite' | 'memory';

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
  if (configured === 'sqlite' || configured === 'memory') {
    return configured;
  }

  if (configured === 'file') {
    throw new Error('BOSSRAID_STORAGE_BACKEND=file was removed. Use sqlite or memory.');
  }

  if (configured != null && strict) {
    throw new Error('BOSSRAID_STORAGE_BACKEND must be sqlite or memory.');
  }

  if (isolateNonProcessEnv && env !== process.env) {
    return 'memory';
  }

  return 'sqlite';
}
