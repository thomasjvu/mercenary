import { type X402Config } from './x402-config.js';

/**
 * Marian / Robinhood-capable x402 facilitator client.
 * PayAI and Coinbase CDP facilitators are not supported on the v1 money rail.
 */
export async function facilitatorRequest<TResponse>(
  config: X402Config,
  path: string,
  body: unknown
): Promise<TResponse> {
  if (!config.facilitatorUrl) {
    throw new Error('BOSSRAID_X402_FACILITATOR_URL is required when x402 is enabled.');
  }

  const baseUrl = new URL(config.facilitatorUrl);
  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }
  const requestUrl = new URL(path.replace(/^\/+/, ''), baseUrl);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (config.facilitatorApiKey) {
    headers.authorization = `Bearer ${config.facilitatorApiKey}`;
    headers['x-api-key'] = config.facilitatorApiKey;
  }

  const host = requestUrl.hostname;
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (requestUrl.protocol !== 'https:' && !isLoopback) {
    throw new Error(
      `x402 facilitator URL must use HTTPS in production (got ${requestUrl.protocol}//${host}).`
    );
  }

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : text || response.statusText;
    throw new Error(`x402 facilitator ${path} failed (${response.status}): ${message}`);
  }

  return parsed as TResponse;
}
