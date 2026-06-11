import { type FastifyReply } from 'fastify';
import { verifyProviderAuth } from '@bossraid/provider-sdk';
import { hashRaidAccessToken } from '@bossraid/raid-core';
import { asSingleHeader } from '@bossraid/shared-types';
import { RAID_ACCESS_TOKEN_HEADER, asSingleQueryValue, safeEqualString } from '../lib/http.js';
import { hashBuyerApiKey } from '../lib/account.js';
import { type ApiContext } from '../api-context.js';
import { createSessionHandlers } from './session.js';
import { createRateLimitHandlers } from './rate-limit.js';

export function createAuthHandlers(ctx: ApiContext) {
  const session = createSessionHandlers(ctx);
  const rateLimit = createRateLimitHandlers(ctx);

  function providerIsAuthorized(
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ): boolean {
    const provider = ctx.orchestrator
      .listProviders()
      .find((item) => item.providerId === providerId);
    if (!provider) {
      return false;
    }

    return verifyProviderAuth({
      auth: provider.auth,
      providerId,
      method: request.method,
      path: request.path,
      body: request.bodyText ?? JSON.stringify(request.body ?? {}),
      headers: request.headers,
      authorizationHeader: asSingleHeader(request.headers.authorization),
      timestampHeader: asSingleHeader(request.headers['x-bossraid-timestamp']),
      signatureHeader: asSingleHeader(request.headers['x-bossraid-signature']),
      providerIdHeader: asSingleHeader(request.headers['x-bossraid-provider-id']),
    });
  }

  function registryIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (!ctx.registryToken) {
      return false;
    }

    return asSingleHeader(headers.authorization) === `Bearer ${ctx.registryToken}`;
  }

  function adminIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (
      ctx.adminToken &&
      safeEqualString(asSingleHeader(headers.authorization), `Bearer ${ctx.adminToken}`)
    ) {
      return true;
    }

    const opsSession = session.readOpsSession(headers);
    return opsSession != null;
  }

  function readBuyerApiKey(headers: Record<string, string | string[] | undefined>) {
    const authorization = asSingleHeader(headers.authorization);
    if (!authorization?.startsWith('Bearer br_')) {
      return undefined;
    }
    return ctx.controlState.readActiveBuyerApiKeyByHash(hashBuyerApiKey(authorization.slice(7)));
  }

  function readPublicAuth(headers: Record<string, string | string[] | undefined>):
    | { type: 'session'; wallet: string; token: string }
    | {
        type: 'api_key';
        wallet: string;
        apiKeyId: string;
        spendLimitUsd?: number;
        spentUsd: number;
      }
    | undefined {
    const apiKey = readBuyerApiKey(headers);
    if (apiKey) {
      return {
        type: 'api_key',
        wallet: apiKey.wallet,
        apiKeyId: apiKey.id,
        spendLimitUsd: apiKey.spendLimitUsd,
        spentUsd: apiKey.spentUsd,
      };
    }

    const publicSession = session.readPublicSession(headers);
    return publicSession
      ? {
          type: 'session',
          wallet: publicSession.wallet,
          token: publicSession.token,
        }
      : undefined;
  }

  function requirePublicSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { wallet: string; token: string } | { error: 'unauthorized' } {
    const publicSession = session.readPublicSession(headers);
    if (!publicSession) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    return {
      wallet: publicSession.wallet,
      token: publicSession.token,
    };
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

  function demoRouteIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (adminIsAuthorized(headers)) {
      return true;
    }

    if (!ctx.demoToken) {
      return true;
    }

    return safeEqualString(asSingleHeader(headers['x-bossraid-demo-token']), ctx.demoToken);
  }

  function requireDemoRouteAccess(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { error: string; message?: string } | undefined {
    if (!ctx.demoRouteEnabled) {
      reply.code(404);
      return {
        error: 'not_found',
        message: 'Demo raid route is not enabled.',
      };
    }

    if (!demoRouteIsAuthorized(headers)) {
      reply.code(401);
      return {
        error: 'unauthorized',
        message: 'Demo raid route requires a valid x-bossraid-demo-token header.',
      };
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
    providerIsAuthorized,
    registryIsAuthorized,
    adminIsAuthorized,
    readPublicAuth,
    requirePublicSession,
    readBuyerApiKey,
    requireAdmin,
    requireDemoRouteAccess,
    requireRateLimit: rateLimit.requireRateLimit,
    requireBuyerApiKeyRateLimit: rateLimit.requireBuyerApiKeyRateLimit,
    requireRaidReadAccess,
    readRaidAccessTokenQuery,
    requireProviderOrRaidReadAccess,
    readOpsSession: session.readOpsSession,
    readPublicSession: session.readPublicSession,
    issueOpsSession: session.issueOpsSession,
    clearOpsSession: session.clearOpsSession,
    issuePublicSessionCookie: session.issuePublicSessionCookie,
    clearPublicSession: session.clearPublicSession,
  };
}
