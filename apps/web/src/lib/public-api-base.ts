export function resolvePublicApiBase(
  configuredBase: string | undefined,
  fallback = '$BOSSRAID_API_BASE'
): string {
  const raw = (configuredBase ?? fallback).trim();
  if (!raw) {
    return fallback;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/$/, '');
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}
