const defaultProvidersFile = './examples/providers.http.json';

export function resolveDevProvidersFile(env = process.env) {
  const raw = env.BOSSRAID_PROVIDERS_FILE ?? defaultProvidersFile;
  if (
    env.BOSSRAID_DEV_FULL_MARKETPLACE === '1' ||
    env.BOSSRAID_DEV_FULL_MARKETPLACE === 'true' ||
    env.BOSSRAID_DEV_FULL_MARKETPLACE === 'yes'
  ) {
    return raw;
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.includes('inference-marketplace-providers.json'));

  return entries.length > 0 ? entries.join(',') : defaultProvidersFile;
}
