import { type FastifyInstance } from 'fastify';
import { parseBossRaidRequest, parseBossRaidSpawnInput } from '@bossraid/api-contracts';
import { asSingleQueryValue } from '../lib/http.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlers } from '../api-handlers.js';

export function registerRaidRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlers
): void {
  const { orchestrator } = ctx;
  const {
    requireAdmin,
    requireDemoRouteAccess,
    spawnParsedRaid,
    registerRaidRoutes: registerRaidDetailRoutes,
    requireProviderOrRaidReadAccess,
    buildProviderSettlementPayload,
  } = handlers;

  app.get('/v1/raids', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.listRaids().map((raid) => ({
      raidId: raid.id,
      status: raid.status,
      createdAt: raid.createdAt,
      updatedAt: raid.updatedAt,
      bestCurrentScore: raid.bestCurrentScore,
      firstValidSubmissionId: raid.firstValidSubmissionId,
      primarySubmissionId: raid.primarySubmissionId,
      successfulSubmissionCount: raid.rankedSubmissions.filter((item) => item.breakdown.valid)
        .length,
    }));
  });

  app.post('/v1/raid', async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidRequest);
  });

  app.post('/v1/demo/raid', async (request, reply) => {
    const demoAccessError = requireDemoRouteAccess(reply, request.headers);
    if (demoAccessError) {
      return demoAccessError;
    }

    return spawnParsedRaid(request, reply, parseBossRaidRequest, {
      requirePayment: false,
    });
  });

  app.post('/v1/raids', async (request, reply) => {
    return spawnParsedRaid(request, reply, parseBossRaidSpawnInput);
  });

  registerRaidDetailRoutes('/v1/raid');
  registerRaidDetailRoutes('/v1/raids');

  app.post('/v1/evaluations/:raidId/replay', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.replayEvaluation((request.params as { raidId: string }).raidId);
  });

  app.get('/v1/raid/:raidId/provider-settlement', async (request, reply) => {
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
  });
}
