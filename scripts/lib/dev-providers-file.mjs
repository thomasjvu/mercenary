export const defaultProvidersFile = './examples/inference-marketplace-providers.json';

const removedProviderFiles = [
  'providers.http.json',
  'providers.compose.json',
  'providers.eigencompute.json',
];

export function resolveDevProvidersFile(env = process.env) {
  const raw = env.BOSSRAID_PROVIDERS_FILE?.trim();
  if (!raw) {
    return defaultProvidersFile;
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !removedProviderFiles.some((legacy) => entry.includes(legacy)));

  return entries.length > 0 ? entries.join(',') : defaultProvidersFile;
}

export function shouldSpawnDevProviders(env = process.env) {
  const flag = env.BOSSRAID_DEV_SPAWN_PROVIDERS?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}
