export class UnsafeProviderEndpointError extends Error {
  readonly code = 'unsafe_provider_endpoint';

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeProviderEndpointError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

function readBooleanEnv(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function stripBrackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/** Cloud metadata / link-local probing targets — never valid seller endpoints. */
export function isBlockedMetadataHost(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.metadata.google.internal')) {
    return true;
  }
  // IPv4 link-local (includes 169.254.169.254 metadata)
  if (/^169\.254\./u.test(host)) {
    return true;
  }
  return false;
}

/** Decode single-number / octal-ish dotted forms the runtime might still connect. */
function decodeNumericIpv4(host: string): string | undefined {
  // Decimal integer form of IPv4 (e.g. 2130706433 → 127.0.0.1)
  if (/^\d+$/u.test(host)) {
    const n = Number(host);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) {
      return undefined;
    }
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  return undefined;
}

export function isPrivateOrSpecialIp(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  if (host === '::1' || host === '0:0:0:0:0:0:0:1') {
    return true;
  }

  const v4Mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (v4Mapped?.[1]) {
    return isPrivateOrSpecialIp(v4Mapped[1]);
  }

  const decoded = decodeNumericIpv4(host);
  if (decoded) {
    return isPrivateOrSpecialIp(decoded);
  }

  // IPv6 unique-local and link-local (prefix match on expanded/compressed forms).
  if (
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:') ||
    host === 'fe80::' ||
    host.startsWith('::1') ||
    host === '0.0.0.0'
  ) {
    return true;
  }

  const parts = host.split('.').map((part) => Number(part));
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) {
      return true;
    }
    if (a !== undefined && a >= 224) {
      return true;
    }
  }

  return false;
}

export function shouldAllowPrivateProviderEndpoints(env: NodeJS.ProcessEnv = process.env): boolean {
  if (readBooleanEnv(env.BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS)) {
    return true;
  }
  return env.NODE_ENV !== 'production';
}

/**
 * Reject provider endpoints that would make the API an open SSRF proxy.
 * Loopback/private targets are allowed outside production (or with explicit opt-in)
 * so local compose providers keep working. Link-local metadata hosts are never allowed.
 */
export function assertProviderEndpointSafe(
  endpoint: string,
  options: { allowPrivateNetwork?: boolean; env?: NodeJS.ProcessEnv } = {}
): void {
  const env = options.env ?? process.env;
  const allowPrivate = options.allowPrivateNetwork ?? shouldAllowPrivateProviderEndpoints(env);

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UnsafeProviderEndpointError('Provider endpoint is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeProviderEndpointError(
      `Unsupported provider endpoint protocol "${url.protocol}". Use http: or https:.`
    );
  }

  if (url.username || url.password) {
    throw new UnsafeProviderEndpointError(
      'Provider endpoint must not include embedded credentials.'
    );
  }

  const hostname = stripBrackets(url.hostname).toLowerCase();
  if (!hostname) {
    throw new UnsafeProviderEndpointError('Provider endpoint hostname is required.');
  }

  if (isBlockedMetadataHost(hostname)) {
    throw new UnsafeProviderEndpointError('Provider endpoint host is blocked.');
  }

  if (!allowPrivate && isPrivateOrSpecialIp(hostname)) {
    throw new UnsafeProviderEndpointError(
      'Provider endpoint targets a private, loopback, or link-local address. Use a public HTTPS endpoint in production, or set BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS=1 for trusted private networks.'
    );
  }

  if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !allowPrivate) {
    throw new UnsafeProviderEndpointError('Provider endpoints must use HTTPS in production.');
  }
}

export type DnsLookupFn = (
  hostname: string,
  options: { all: true }
) => Promise<Array<{ address: string; family: number }>>;

/**
 * Resolve the endpoint hostname and re-check every address for private/special
 * ranges. Mitigates DNS-rebinding SSRF where a public hostname resolves to a
 * link-local or private IP at request time.
 *
 * Residual TOCTOU: address is not pinned into the TCP connect; a rebinding
 * race between lookup and fetch remains possible without a custom agent.
 */
export async function assertProviderEndpointResolvedSafe(
  endpoint: string,
  options: {
    allowPrivateNetwork?: boolean;
    env?: NodeJS.ProcessEnv;
    lookup?: DnsLookupFn;
  } = {}
): Promise<void> {
  assertProviderEndpointSafe(endpoint, options);

  const env = options.env ?? process.env;
  const allowPrivate = options.allowPrivateNetwork ?? shouldAllowPrivateProviderEndpoints(env);

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UnsafeProviderEndpointError('Provider endpoint is not a valid URL.');
  }

  const hostname = stripBrackets(url.hostname).toLowerCase();
  // Literal IPs already checked by assertProviderEndpointSafe.
  if (isPrivateOrSpecialIp(hostname) || isLikelyIpLiteral(hostname)) {
    return;
  }

  const lookup =
    options.lookup ??
    (async (host, opts) => {
      const dns = await import('node:dns/promises');
      return dns.lookup(host, opts);
    });

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (error) {
    throw new UnsafeProviderEndpointError(
      `Provider endpoint DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!addresses.length) {
    throw new UnsafeProviderEndpointError('Provider endpoint DNS lookup returned no addresses.');
  }

  for (const { address } of addresses) {
    if (isBlockedMetadataHost(address)) {
      throw new UnsafeProviderEndpointError(
        `Provider endpoint resolves to blocked metadata address ${address}.`
      );
    }
    if (!allowPrivate && isPrivateOrSpecialIp(address)) {
      throw new UnsafeProviderEndpointError(
        `Provider endpoint resolves to private, loopback, or link-local address ${address}. Use a public HTTPS endpoint in production, or set BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS=1 for trusted private networks.`
      );
    }
  }
}

function isLikelyIpLiteral(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) {
    return true;
  }
  // Rough IPv6: contains ':' and only hex/colon chars
  if (host.includes(':') && /^[0-9a-f:]+$/u.test(host)) {
    return true;
  }
  if (/^\d+$/u.test(host)) {
    return true;
  }
  return false;
}
