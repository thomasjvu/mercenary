export function resolvePhantasyCmsUrl(): string {
  const configured = import.meta.env.VITE_PHANTASY_CMS_URL as string | undefined;
  if (configured?.trim()) {
    return configured.trim().replace(/\/+$/u, '');
  }
  return 'https://phantasy.bot';
}

export function resolvePhantasyMapUrl(): string {
  const configured = import.meta.env.VITE_PHANTASY_MAP_URL as string | undefined;
  if (configured?.trim()) {
    return configured.trim().replace(/\/+$/u, '');
  }
  return `${resolvePhantasyCmsUrl()}/map`;
}
