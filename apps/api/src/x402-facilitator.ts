import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { createFacilitatorConfig as createPayAIFacilitatorConfig } from '@payai/facilitator';
import { type X402Config } from './x402-config.js';

export const DEFAULT_CDP_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';
const CDP_JWT_EXPIRES_IN_SEC = 120;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function encodeJwtSegment(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

function normalizePemSecret(secret: string): string {
  return secret.includes('\\n') ? secret.replace(/\\n/g, '\n') : secret;
}

function isLikelyPemPrivateKey(secret: string): boolean {
  return secret.includes('BEGIN');
}

function isLikelyEd25519Secret(secret: string): boolean {
  try {
    return Buffer.from(secret, 'base64').length === 64;
  } catch {
    return false;
  }
}

export function isCdpFacilitator(config: X402Config): boolean {
  if (!config.facilitatorUrl) {
    return false;
  }

  return new URL(config.facilitatorUrl).host === 'api.cdp.coinbase.com';
}

export function isPayAIFacilitator(config: X402Config): boolean {
  if (!config.facilitatorUrl) {
    return false;
  }

  return new URL(config.facilitatorUrl).host === 'facilitator.payai.network';
}

function createEd25519PrivateKey(secret: string) {
  const decoded = Buffer.from(secret, 'base64');
  if (decoded.length !== 64) {
    throw new Error('CDP Ed25519 API key secret must be 64 bytes after base64 decoding.');
  }

  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  return createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: seed.toString('base64url'),
      x: publicKey.toString('base64url'),
    },
    format: 'jwk',
  });
}

function buildCdpBearerToken(config: X402Config, requestUrl: URL, method: string): string {
  if (!config.cdpApiKeyId || !config.cdpApiKeySecret) {
    throw new Error('Coinbase CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET.');
  }

  const now = Math.floor(Date.now() / 1_000);
  const expiresIn = CDP_JWT_EXPIRES_IN_SEC;
  const payload = {
    sub: config.cdpApiKeyId,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [`${method.toUpperCase()} ${requestUrl.host}${requestUrl.pathname}${requestUrl.search}`],
    iat: now,
    nbf: now,
    exp: now + expiresIn,
  };
  const nonce = randomBytes(16).toString('hex');
  const normalizedSecret = normalizePemSecret(config.cdpApiKeySecret);
  const signingInput = [
    encodeJwtSegment({
      alg: isLikelyPemPrivateKey(normalizedSecret) ? 'ES256' : 'EdDSA',
      kid: config.cdpApiKeyId,
      typ: 'JWT',
      nonce,
    }),
    encodeJwtSegment(payload),
  ].join('.');

  let signature: Buffer;
  if (isLikelyPemPrivateKey(normalizedSecret)) {
    signature = sign('sha256', Buffer.from(signingInput), {
      key: createPrivateKey(normalizedSecret),
      dsaEncoding: 'ieee-p1363',
    });
  } else if (isLikelyEd25519Secret(normalizedSecret)) {
    signature = sign(null, Buffer.from(signingInput), createEd25519PrivateKey(normalizedSecret));
  } else {
    throw new Error(
      'Unsupported CDP_API_KEY_SECRET format. Use a PEM EC private key or a base64 Ed25519 secret.'
    );
  }

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

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
  if (isCdpFacilitator(config)) {
    headers.authorization = `Bearer ${buildCdpBearerToken(config, requestUrl, 'POST')}`;
  } else if (isPayAIFacilitator(config)) {
    const authHeaders = await createPayAIFacilitatorConfig(
      config.payaiApiKeyId,
      config.payaiApiKeySecret
    ).createAuthHeaders?.();
    const endpoint = path.replace(/^\/+/, '') === 'settle' ? 'settle' : 'verify';
    Object.assign(headers, authHeaders?.[endpoint] ?? {});
  }

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = {} as TResponse;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as TResponse;
    } catch (error) {
      throw new Error(
        `x402 facilitator ${path} returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  if (!response.ok) {
    throw new Error(
      `x402 facilitator ${path} failed (${response.status})${text.length > 0 ? `: ${text}` : ''}`
    );
  }
  return payload;
}
