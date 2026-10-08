import { isUpstreamProviderId } from '@bossraid/constants';

export function readPlatformUpstreamApiKey(
  provider: string,
  env: NodeJS.ProcessEnv
): string | undefined {
  if (!isUpstreamProviderId(provider)) {
    return undefined;
  }
  const envKey = `BOSSRAID_${provider.toUpperCase()}_API_KEY`;
  return env[envKey]?.trim() || undefined;
}
