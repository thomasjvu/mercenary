import { type FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  raidIdParamsSchema,
  raidResultResponseSchema,
  raidStatusResponseSchema,
  spawnRaidBodySchema,
} from '@bossraid/openapi-schemas';
import { internalRouteSchema, publicRouteSchema } from '../openapi/audience.js';
import { parseBossRaidRequest } from '@bossraid/api-contracts';
import { asSingleHeader } from '@bossraid/shared-types';
import { buildAgentLog } from '../agent-log.js';
import {
  buildAttestedRaidResultPayload,
  buildAttestedRaidResultMessage,
  hashAttestationText,
} from '../lib/attestation.js';
import { asSingleQueryValue, RAID_ACCESS_TOKEN_HEADER } from '../lib/http.js';
import {
  serializeRaidResult,
  serializeRaidStatus,
  toRaidListItemResponse,
} from '../lib/serializers.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

/** Admin list default page size; keeps ops responses bounded under retention growth. */
export const ADMIN_RAID_LIST_DEFAULT_LIMIT = 100;
export const ADMIN_RAID_LIST_MAX_LIMIT = 500;

function readPositiveIntQuery(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const asString = asSingleQueryValue(value);
  if (asString == null || asString === '') {
    return undefined;
  }
  const parsed = Number(asString);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAdminRaidListPagination(query: { limit?: unknown; offset?: unknown }): {
  limit: number;
  offset: number;
} {
  let limit = ADMIN_RAID_LIST_DEFAULT_LIMIT;
  const parsedLimit = readPositiveIntQuery(query.limit);
  if (parsedLimit != null && parsedLimit > 0) {
    limit = Math.min(Math.floor(parsedLimit), ADMIN_RAID_LIST_MAX_LIMIT);
  }

  let offset = 0;
  const parsedOffset = readPositiveIntQuery(query.offset);
  if (parsedOffset != null && parsedOffset > 0) {
    offset = Math.floor(parsedOffset);
  }

  return { limit, offset };
}

function registerRaidDetailRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const basePath = '/v1/raid';
  const { requireRaidReadAccess, readRaidAccessTokenQuery, requireAdmin } = handlers.auth;
  const { ensureSettlementProofState, getRaidId } = handlers.raid;

  app.get(
    `${basePath}/:raidId`,
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Get raid status',
        params: raidIdParamsSchema,
        response: {
          200: raidStatusResponseSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      return serializeRaidStatus(ctx.orchestrator.getStatus(raidId));
    }
  );

  app.get(
    `${basePath}/:raidId/result`,
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Get raid result',
        params: raidIdParamsSchema,
        response: {
          200: raidResultResponseSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      await ensureSettlementProofState(raidId);
      return serializeRaidResult(ctx.orchestrator.getResult(raidId));
    }
  );

  app.get(
    `${basePath}/:raidId/agent_log.json`,
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Download Mercenary agent log JSON',
        params: raidIdParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const raidId = getRaidId(request);
      const queryAccessToken = readRaidAccessTokenQuery(request.query);
      const authorizationError = requireRaidReadAccess(
        reply,
        raidId,
        request.headers,
        queryAccessToken
      );
      if (authorizationError) {
        return authorizationError;
      }

      const raid = ctx.orchestrator.getRaid(raidId);
      if (!raid) {
        reply.code(404);
        return {
          error: 'not_found',
          message: `Unknown raid: ${raidId}`,
        };
      }

      reply.header('cache-control', 'private, no-store');
      await ensureSettlementProofState(raidId);
      await handlers.raid.ensureErc8004ProofState({ includeMercenary: false });
      return buildAgentLog(raid, {
        getRaid: (currentRaidId) => ctx.orchestrator.getRaid(currentRaidId),
        getProvider: (providerId) => ctx.orchestrator.getProviderProfile(providerId),
        raidAccessToken:
          asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken,
      });
    }
  );

  app.get(
    `${basePath}/:raidId/attested-result`,
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Get TEE-attested raid result proof',
        params: raidIdParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: apiErrorSchema,
          404: apiErrorSchema,
          503: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      if (!ctx.teeSigner.account) {
        reply.code(503);
        return {
          error: 'tee_signer_not_configured',
          message:
            ctx.teeSigner.error ??
            'MNEMONIC environment variable is required for attested raid result proofs.',
        };
      }

      await ensureSettlementProofState(raidId);
      const result = ctx.orchestrator.getResult(raidId);
      const payload = buildAttestedRaidResultPayload(ctx.env, result, ctx.workerIsolation);
      const message = buildAttestedRaidResultMessage(payload);
      const signature = await ctx.teeSigner.account.signMessage({ message });

      return {
        signer: ctx.teeSigner.account.address,
        message,
        messageHash: hashAttestationText(message),
        signature,
        payload,
      };
    }
  );

  app.post(
    `${basePath}/:raidId/abort`,
    {
      schema: internalRouteSchema({
        tags: ['Raid'],
        summary: 'Abort a raid (admin)',
        params: raidIdParamsSchema,
        response: {
          200: raidStatusResponseSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }

      return ctx.orchestrator.abortRaid(getRaidId(request));
    }
  );
}

export function registerRaidRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator } = ctx;
  const { requireAdmin, requireProviderOrRaidReadAccess } = handlers.auth;
  const { spawnParsedRaid, buildProviderSettlementPayload } = handlers.raid;

  app.get(
    '/v1/raids',
    {
      schema: internalRouteSchema({
        tags: ['Raid'],
        summary: 'List raids (admin)',
        querystring: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              default: ADMIN_RAID_LIST_DEFAULT_LIMIT,
              description: `Max raids to return (default ${ADMIN_RAID_LIST_DEFAULT_LIMIT}; values above ${ADMIN_RAID_LIST_MAX_LIMIT} are clamped).`,
            },
            offset: {
              type: 'integer',
              minimum: 0,
              default: 0,
              description: 'Number of newest root raids to skip (createdAt desc).',
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          401: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }

      const { limit, offset } = parseAdminRaidListPagination(
        request.query as { limit?: unknown; offset?: unknown }
      );
      const raids = orchestrator.listRaids();
      reply.header('x-total-count', String(raids.length));
      return raids.slice(offset, offset + limit).map(toRaidListItemResponse);
    }
  );

  app.post(
    '/v1/raid',
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Spawn a Mercenary raid',
        body: spawnRaidBodySchema,
        response: {
          200: raidStatusResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          402: apiErrorSchema,
          409: apiErrorSchema,
          503: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => spawnParsedRaid(request, reply, parseBossRaidRequest)
  );

  registerRaidDetailRoutes(app, ctx, handlers);

  app.post(
    '/v1/evaluations/:raidId/replay',
    {
      schema: internalRouteSchema({
        tags: ['Raid'],
        summary: 'Replay raid evaluation (admin)',
        params: raidIdParamsSchema,
        response: {
          200: { type: 'object', additionalProperties: true },
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }

      return orchestrator.replayEvaluation((request.params as { raidId: string }).raidId);
    }
  );

  app.get(
    '/v1/raid/:raidId/provider-settlement',
    {
      schema: publicRouteSchema({
        tags: ['Raid'],
        summary: 'Get provider settlement payload for a raid',
        params: raidIdParamsSchema,
        querystring: {
          type: 'object',
          properties: {
            providerId: { type: 'string' },
            provider_id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const raidId = (request.params as { raidId: string }).raidId;
      const query = request.query as { providerId?: unknown; provider_id?: unknown };
      const providerId =
        asSingleQueryValue(query.providerId) ?? asSingleQueryValue(query.provider_id);
      if (!providerId) {
        reply.code(400);
        return {
          error: 'bad_request',
          message: 'providerId is required.',
        };
      }
      const authorizationError = requireProviderOrRaidReadAccess(reply, raidId, providerId, {
        method: request.method,
        path: request.url,
        body: {},
        bodyText: '',
        headers: request.headers,
      });
      if (authorizationError) {
        return authorizationError;
      }
      const payload = await buildProviderSettlementPayload(raidId, providerId);
      if (!payload) {
        reply.code(404);
        return {
          error: 'not_found',
          message: `No settlement data for provider ${providerId} on raid ${raidId}.`,
        };
      }
      return payload;
    }
  );
}
