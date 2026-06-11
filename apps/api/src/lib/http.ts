import { createHash, timingSafeEqual } from 'node:crypto';
import { type FastifyRequest } from 'fastify';
import { ApiContractError } from '@bossraid/api-contracts';
import { type BossRaidSpawnInput } from '@bossraid/shared-types';
import { stableStringify } from './attestation.js';

export const OPS_SESSION_COOKIE_NAME = 'bossraid_ops_session';
export const PUBLIC_SESSION_COOKIE_NAME = 'bossraid_session';
export const RAID_ACCESS_TOKEN_HEADER = 'x-bossraid-raid-token';

export function asSingleQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export function safeEqualString(left: string | undefined, right: string): boolean {
  if (typeof left !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function parseCookieHeader(header: string): Record<string, string> {
  const entries = header.split(';');
  const cookies: Record<string, string> = {};

  for (const entry of entries) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('='));
  }

  return cookies;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    path?: string;
    maxAge?: number;
    secure?: boolean;
  }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function readClientRateLimitKey(request: FastifyRequest): string {
  return request.ip;
}

export function buildLaunchRequestKey(
  request: FastifyRequest,
  route: 'raid' | 'chat',
  input: BossRaidSpawnInput
): string {
  return createHash('sha256')
    .update(`${readClientRateLimitKey(request)}\n${route}\n${stableStringify(input)}`)
    .digest('hex');
}

export function parseOpsSessionInput(value: unknown): { token: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiContractError('Expected object for ops_session.');
  }

  const token = (value as Record<string, unknown>).token;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new ApiContractError('Expected non-empty string for ops_session.token.');
  }

  return {
    token: token.trim(),
  };
}
