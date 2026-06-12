export function readApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Request failed.';
}

export function buildApiReadinessHint(error: unknown): string {
  const message = readApiErrorMessage(error).toLowerCase();

  if (message.includes('api_origin_not_configured')) {
    return 'Set the Cloudflare Pages secret BOSSRAID_API_ORIGIN to your public API host.';
  }

  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'Start the API with pnpm dev or pnpm dev:api, then reload.';
  }

  if (message.includes('timed out')) {
    return 'The API is not responding. Check that port 8787 is reachable from the web proxy.';
  }

  return 'Check API origin and readiness.';
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}
