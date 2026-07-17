import type { FastifyInstance } from 'fastify';
import { ApiContractError } from '@bossraid/api-contracts';
import {
  createDefaultOrchestrator,
  InvalidRaidLaunchReservationError,
  NoEligibleProvidersError,
  PersistenceUnavailableError,
  ProviderRegistrationConflictError,
  runtimeOptionsFromEnv,
  UnknownRaidError,
  type BossRaidOrchestrator,
} from '@bossraid/orchestrator';
import { UnsafeProviderEndpointError } from '@bossraid/provider-sdk';
import { NETWORK } from '@bossraid/constants';
import logger from '@bossraid/logger';
import { mapContractErrorCode } from './lib/contract-errors.js';
import { isX402ProtocolError } from './x402.js';
import { sendX402Required } from './lib/x402-route-response.js';
import { createApiContext, createApiContextAsync } from './api-context.js';
import { createApiHandlers } from './handlers/index.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerHostAttestationRoutes } from './routes/host-attestation.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerMarketplaceRoutes } from './routes/marketplace.js';
import { registerRaidRoutes } from './routes/raid.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerOpsRoutes } from './routes/ops.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerInferenceGatewayRoutes } from './routes/inference-gateway.js';
import { registerSellerUpstreamRoutes } from './routes/seller-upstream.js';
import { registerMarketplaceTeeRoutes } from './routes/marketplace-tee.js';
import { registerInferenceReceiptRoutes } from './routes/inference-receipts.js';
import { registerRelayerRoutes } from './routes/relayer.js';
import { registerBountyRoutes } from './routes/bounties.js';
import { startX402ReconciliationWorker } from './lib/x402-reconciliation.js';
import { registerOpenApi } from './openapi/register.js';
import type { ApiContext } from './api-context.js';
import type { ApiHandlerGroups } from './handlers/index.js';

export { resolveChatTerminalSettleGraceMs } from './lib/env.js';

function registerApiRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  registerHealthRoutes(app, ctx, handlers);
  registerHostAttestationRoutes(app, ctx, handlers);
  registerAuthRoutes(app, ctx, handlers);
  registerAccountRoutes(app, ctx, handlers);
  registerMarketplaceRoutes(app, ctx, handlers);
  registerRaidRoutes(app, ctx, handlers);
  registerChatRoutes(app, ctx, handlers);
  registerOpsRoutes(app, ctx, handlers);
  registerProviderRoutes(app, ctx, handlers);
  registerAgentRoutes(app, ctx, handlers);
  registerInferenceGatewayRoutes(app, ctx);
  registerSellerUpstreamRoutes(app, ctx, handlers);
  registerMarketplaceTeeRoutes(app, ctx, handlers);
  registerInferenceReceiptRoutes(app, ctx);
  registerRelayerRoutes(app, ctx, handlers);
  registerBountyRoutes(app, ctx, handlers);
}

function wireApiServer(app: FastifyInstance, ctx: ApiContext, handlers: ApiHandlerGroups): void {
  const { apiMetrics, requestStartTimes } = ctx;

  app.addHook('onRequest', (request, _reply, done) => {
    requestStartTimes.set(request, Date.now());
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const startedAt = requestStartTimes.get(request);
    requestStartTimes.delete(request);
    apiMetrics.recordHttp({
      method: request.method,
      route: request.routeOptions.url ?? request.url.split('?')[0] ?? 'unknown',
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Date.now() - (startedAt ?? Date.now())),
    });
    done();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isX402ProtocolError(error)) {
      apiMetrics.increment('x402.payment_required');
      sendX402Required(reply, error);
      return;
    }

    if (error instanceof ApiContractError) {
      apiMetrics.increment('requests.bad_request');
      reply.code(error.statusCode).send({
        error: mapContractErrorCode(error.statusCode),
        message: error.message,
      });
      return;
    }

    if (error instanceof NoEligibleProvidersError) {
      apiMetrics.increment('routing.no_eligible_providers');
      reply.code(409).send({
        error: 'no_eligible_providers',
        message: error.message,
      });
      return;
    }

    if (error instanceof ProviderRegistrationConflictError) {
      reply.code(409).send({
        error: error.code,
        message: error.message,
        providerId: error.conflict.providerId,
        reason: error.conflict.reason,
      });
      return;
    }

    if (error instanceof UnsafeProviderEndpointError) {
      reply.code(400).send({
        error: error.code,
        message: error.message,
      });
      return;
    }

    if (error instanceof UnknownRaidError) {
      reply.code(404).send({
        error: 'not_found',
        message: error.message,
      });
      return;
    }

    if (error instanceof InvalidRaidLaunchReservationError) {
      reply.code(409).send({
        error: 'invalid_launch_reservation',
        message: error.message,
      });
      return;
    }

    if (error instanceof PersistenceUnavailableError) {
      apiMetrics.increment('persistence.unavailable');
      reply.code(503).send({
        error: 'persistence_unavailable',
        message: error.message,
      });
      return;
    }

    apiMetrics.increment('requests.internal_error');
    logger.error(error);
    reply.code(500).send({
      error: 'internal_error',
      message: 'Internal server error.',
    });
  });

  registerApiRoutes(app, ctx, handlers);
  startX402ReconciliationWorker(ctx);
}

export function buildApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
) {
  const ctx = createApiContext(orchestrator, env);
  const handlers = createApiHandlers(ctx);
  wireApiServer(ctx.app, ctx, handlers);
  return ctx.app;
}

export async function prepareApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
) {
  const ctx = await createApiContextAsync(orchestrator, env);
  const handlers = createApiHandlers(ctx);
  await registerOpenApi(ctx.app);
  wireApiServer(ctx.app, ctx, handlers);
  return ctx.app;
}

async function main() {
  const orchestrator = await createDefaultOrchestrator(runtimeOptionsFromEnv());
  const app = await prepareApiServer(orchestrator);
  if (process.env.BOSSRAID_BOOTSTRAP_PLATFORM_LIQUIDITY === '1') {
    const { bootstrapPlatformLiquidity } = await import('./lib/platform-liquidity.js');
    const result = await bootstrapPlatformLiquidity({ orchestrator, env: process.env });
    logger.info(
      {
        published: result.published.length,
        skipped: result.skipped.length,
      },
      'platform liquidity bootstrap complete'
    );
  }
  const port = Number(process.env.PORT || NETWORK.LOCAL_API_PORT.toString());
  const host = process.env.BOSSRAID_API_HOST ?? process.env.HOST ?? NETWORK.LOCALHOST;
  await app.listen({ port, host });
  logger.info(`Boss Raid API listening on http://${host}:${port}`);
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error(error);
    process.exit(1);
  });
}

function registerShutdownHandlers(closeServer: () => Promise<void>): void {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info(`Shutting down Boss Raid API after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      logger.error(error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
