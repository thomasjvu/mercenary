import { randomBytes } from 'node:crypto';
import { TIMEOUTS } from '@bossraid/constants';

export async function fetchUpstreamJson<T>(
  url: string,
  options: {
    apiKey: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? TIMEOUTS.VENICE_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${options.apiKey.trim()}`,
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream request failed (${response.status}).`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function generateAttestationNonce(): string {
  return randomBytes(32).toString('hex');
}

export function isTeeModelId(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.startsWith('tee-') || normalized.startsWith('e2ee-') || normalized.includes('phala/')
  );
}

export function isE2eeModelId(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.startsWith('e2ee-');
}
