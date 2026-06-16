import { type FastifyReply } from 'fastify';
import { hashRaidAccessToken } from '@bossraid/raid-core';
import { asSingleHeader } from '@bossraid/shared-types';
import { RAID_ACCESS_TOKEN_HEADER, asSingleQueryValue, safeEqualString } from '../../lib/http.js';
import { type ApiContext } from '../../api-context.js';

export function createRouteAccessAuth(
  ctx: ApiContext,
  readOpsSession: (
    headers: Record<string, string | string[] | undefined>
  ) => { token: string; expiresAt: number } | undefined,
  providerIsAuthorized: (
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ) => boolean
) {
  function adminIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (
      ctx.adminToken &&
      safeEqualString(asSingleHeader(headers.authorization), `Bearer ${ctx.adminToken}`)
    ) {
      return true;
    }

    const opsSession = readOpsSession(headers);
    return opsSession != null;
  }

  function requireAdmin(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { error: string; message?: string } | undefined {
    if (!ctx.adminToken) {
      reply.code(503);
      return {
        error: 'admin_auth_not_configured',
        message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
      };
    }

    if (!adminIsAuthorized(headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    return undefined;
  }

  function requireRaidReadAccess(
    reply: FastifyReply,
    raidId: string,
    headers: Record<string, string | string[] | undefined>,
    queryAccessToken?: string
  ): { error: string } | undefined {
    if (adminIsAuthorized(headers)) {
      return undefined;
    }

    const raid = ctx.orchestrator.getRaid(raidId);
    const raidAccessToken = asSingleHeader(headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken;
    const expectedHash = raid?.raidAccessTokenHash;
    if (
      !raidAccessToken ||
      !expectedHash ||
      !safeEqualString(hashRaidAccessToken(raidAccessToken), expectedHash)
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    return undefined;
  }

  function readRaidAccessTokenQuery(query: unknown): string | undefined {
    const params = query as
      | {
          token?: unknown;
          raidAccessToken?: unknown;
          raid_access_token?: unknown;
        }
      | undefined;
    return (
      asSingleQueryValue(params?.token) ??
      asSingleQueryValue(params?.raidAccessToken) ??
      asSingleQueryValue(params?.raid_access_token)
    );
  }

  function requireProviderOrRaidReadAccess(
    reply: FastifyReply,
    raidId: string,
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ): { error: string; message?: string } | undefined {
    if (adminIsAuthorized(request.headers)) {
      return undefined;
    }
    if (
      providerIsAuthorized(providerId, {
        method: request.method,
        path: request.path,
        body: request.body,
        bodyText: request.bodyText,
        headers: request.headers,
      })
    ) {
      return undefined;
    }

    const raid = ctx.orchestrator.getRaid(raidId);
    const token = asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]);
    if (
      token &&
      raid?.raidAccessTokenHash &&
      safeEqualString(hashRaidAccessToken(token), raid.raidAccessTokenHash)
    ) {
      return undefined;
    }

    reply.code(401);
    return { error: 'unauthorized' };
  }

  return {
    adminIsAuthorized,
    requireAdmin,
    requireRaidReadAccess,
    readRaidAccessTokenQuery,
    requireProviderOrRaidReadAccess,
  };
}
