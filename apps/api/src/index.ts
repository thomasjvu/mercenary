import { ApiContractError } from '@bossraid/api-contracts';
import {
  createDefaultOrchestrator,
  InvalidRaidLaunchReservationError,
  NoEligibleProvidersError,
  PersistenceUnavailableError,
  runtimeOptionsFromEnv,
  UnknownRaidError,
  type BossRaidOrchestrator,
} from '@bossraid/orchestrator';
import { NETWORK } from '@bossraid/constants';
import logger from '@bossraid/logger';
import { mapContractErrorCode } from './lib/contract-errors.js';
import { applyX402Headers, isX402ProtocolError } from './x402.js';
import { createApiContext } from './api-context.js';
import { createApiHandlers } from './api-handlers.js';
import { registerHealthRoutes } from './routes/health.js';
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

export { resolveChatTerminalSettleGraceMs } from './lib/env.js';

export function buildApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
) {
  const ctx = createApiContext(orchestrator, env);
  const handlers = createApiHandlers(ctx);
  const { app, apiMetrics, requestStartTimes } = ctx;

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
      const reservationId = error.paymentRequired.accepts[0]?.extra?.reservationId;
      if (typeof reservationId === 'string') {
        reply.header('X-BOSSRAID-LAUNCH-RESERVATION', reservationId);
      }
      applyX402Headers(reply, {
        paymentRequired: error.paymentRequired,
        settlement: error.settlement,
      });
      reply.code(error.statusCode).send({
        error: 'payment_required',
        message: error.message,
        x402: error.paymentRequired,
        settlement: error.settlement,
      });
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

  registerHealthRoutes(app, ctx, handlers);
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

  return app;
}

async function main() {
  const orchestrator = await createDefaultOrchestrator(runtimeOptionsFromEnv());
  const app = buildApiServer(orchestrator);
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
