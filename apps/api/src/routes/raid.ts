import { type FastifyInstance } from 'fastify';
import { parseBossRaidRequest, parseBossRaidSpawnInput } from '@bossraid/api-contracts';
import { asSingleHeader } from '@bossraid/shared-types';
import { buildAgentLog } from '../agent-artifacts.js';
import {
  buildAttestedRaidResultPayload,
  buildAttestedRaidResultMessage,
  hashAttestationText,
} from '../lib/attestation.js';
import { asSingleQueryValue, RAID_ACCESS_TOKEN_HEADER } from '../lib/http.js';
import { toRaidListItemResponse } from '../lib/serializers.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlers } from '../api-handlers.js';

function registerRaidDetailRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlers,
  basePath: '/v1/raid' | '/v1/raids'
): void {
  const {
    requireRaidReadAccess,
    readRaidAccessTokenQuery,
    requireAdmin,
    ensureSettlementProofState,
    recordMarketplaceLedgersFromRaid,
    getRaidId,
  } = handlers;

  app.get(`${basePath}/:raidId`, async (request, reply) => {
    const raidId = getRaidId(request);
    const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
    if (authorizationError) {
      return authorizationError;
    }

    return ctx.orchestrator.getStatus(raidId);
  });

  app.get(`${basePath}/:raidId/result`, async (request, reply) => {
    const raidId = getRaidId(request);
    const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
    if (authorizationError) {
      return authorizationError;
    }

    await ensureSettlementProofState(raidId);
    const result = ctx.orchestrator.getResult(raidId);
    if (result.status === 'final') {
      recordMarketplaceLedgersFromRaid({
        raidId,
        route: 'raid',
        skipBuyerPurchase: true,
      });
    }
    return result;
  });

  app.get(`${basePath}/:raidId/agent_log.json`, async (request, reply) => {
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
    await handlers.ensureErc8004ProofState({ includeMercenary: false });
    return buildAgentLog(raid, {
      getRaid: (currentRaidId) => ctx.orchestrator.getRaid(currentRaidId),
      getProvider: (providerId) => ctx.orchestrator.getProviderProfile(providerId),
      raidAccessToken:
        asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken,
    });
  });

  app.get(`${basePath}/:raidId/attested-result`, async (request, reply) => {
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
  });

  app.post(`${basePath}/:raidId/abort`, async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return ctx.orchestrator.abortRaid(getRaidId(request));
  });
}

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
    requireProviderOrRaidReadAccess,
    buildProviderSettlementPayload,
  } = handlers;

  app.get('/v1/raids', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return orchestrator.listRaids().map(toRaidListItemResponse);
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

  registerRaidDetailRoutes(app, ctx, handlers, '/v1/raid');
  registerRaidDetailRoutes(app, ctx, handlers, '/v1/raids');

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
