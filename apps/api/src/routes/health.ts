import { type FastifyInstance } from 'fastify';
import { readStorageBackend } from '@bossraid/constants';
import { readTeeSocketState } from '../lib/tee.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import { buildProductionReadinessReport } from '../lib/production-readiness.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../api-handlers.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, env, apiMetrics, metricsPublic } = ctx;
  const { requireAdmin } = handlers.auth;
  const { collectProviderHealth } = handlers.raid;
  const {
    publicRateLimitMax,
    publicRateLimitWindowMs,
    buyerKeyRateLimitMax,
    buyerKeyRateLimitWindowMs,
    buyerKeyDefaultSpendLimitUsd,
    buyerMaxRequestBudgetUsd,
    workerIsolation,
  } = ctx;

  app.get('/health', async () => {
    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();

    return {
      ok:
        persistence.healthy &&
        providerHealth.length > 0 &&
        providerHealth.every((provider) => provider.ready),
      providers: orchestrator.listProviders().length,
      readyProviders: providerHealth.filter((provider) => provider.ready).length,
      raids: orchestrator.listRaids().length,
    };
  });

  app.get('/ready', async () => {
    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();
    const x402Config = readX402ConfigForContext(ctx);
    const settlementMode = env.BOSSRAID_SETTLEMENT_MODE ?? 'off';
    const settlementConfigured =
      settlementMode === 'off' ||
      Boolean(env.BOSSRAID_RPC_URL && env.BOSSRAID_REGISTRY_ADDRESS && env.BOSSRAID_ESCROW_ADDRESS);
    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    const tee = await readTeeSocketState(teeSocketPath);
    const secretsEncrypted =
      readStorageBackend(env) === 'memory' ||
      Boolean((env.BOSSRAID_SECRET_ENCRYPTION_KEY ?? env.BOSSRAID_ENCRYPTION_KEY)?.trim());
    const x402Configured =
      !x402Config.enabled ||
      (Boolean(x402Config.facilitatorUrl) &&
        x402Config.payTo !== '0x0000000000000000000000000000000000000000');
    const gates = {
      api: true,
      storage: persistence.healthy,
      secretsEncrypted,
      providers: providerHealth.length > 0 && providerHealth.some((provider) => provider.ready),
      x402: x402Configured,
      settlement: settlementConfigured,
      tee: {
        configured: Boolean(env.MNEMONIC),
        platform: env.BOSSRAID_TEE_PLATFORM ?? null,
        ...tee,
      },
    };

    return {
      ok:
        gates.api &&
        gates.storage &&
        gates.secretsEncrypted &&
        gates.providers &&
        gates.x402 &&
        gates.settlement,
      gates,
      providers: orchestrator.listProviders().length,
      readyProviders: providerHealth.filter((provider) => provider.ready).length,
      storage: persistence,
      encryption: {
        enabled: secretsEncrypted,
        keyId: env.BOSSRAID_SECRET_ENCRYPTION_KEY_ID ?? null,
      },
      payment: {
        enabled: x402Config.enabled,
        network: x402Config.network,
        asset: x402Config.asset,
        facilitatorConfigured: Boolean(x402Config.facilitatorUrl),
      },
      settlement: {
        mode: settlementMode,
        configured: settlementConfigured,
      },
    };
  });

  app.get('/metrics', async (request, reply) => {
    if (!metricsPublic) {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }
    }

    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return apiMetrics.toPrometheus();
  });

  app.get('/v1/ops/metrics', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    return apiMetrics.snapshot();
  });

  app.get('/v1/ops/production-readiness', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const providerHealth = await collectProviderHealth();
    const persistence = orchestrator.getPersistenceStatus();
    const x402Config = readX402ConfigForContext(ctx);
    const settlementMode = env.BOSSRAID_SETTLEMENT_MODE ?? 'off';
    const teeSocketPath = env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
    const tee = await readTeeSocketState(teeSocketPath);
    return buildProductionReadinessReport({
      env,
      storageBackend: readStorageBackend(env),
      persistenceHealthy: persistence.healthy,
      providers: orchestrator.listProviders(),
      providerHealth,
      x402: {
        enabled: x402Config.enabled,
        facilitatorConfigured: Boolean(x402Config.facilitatorUrl),
        payToConfigured: x402Config.payTo !== '0x0000000000000000000000000000000000000000',
        network: x402Config.network,
        asset: x402Config.asset,
      },
      settlement: {
        mode: settlementMode,
        configured:
          settlementMode === 'onchain' &&
          Boolean(
            env.BOSSRAID_RPC_URL &&
            env.BOSSRAID_CHAIN_ID &&
            env.BOSSRAID_REGISTRY_ADDRESS &&
            env.BOSSRAID_ESCROW_ADDRESS &&
            env.BOSSRAID_TOKEN_ADDRESS &&
            env.BOSSRAID_CLIENT_PRIVATE_KEY &&
            env.BOSSRAID_EVALUATOR_ADDRESS
          ),
      },
      tee: {
        configured: Boolean(env.MNEMONIC),
        platform: env.BOSSRAID_TEE_PLATFORM ?? null,
        ...tee,
      },
      limits: {
        publicRateLimitMax,
        publicRateLimitWindowMs,
        buyerKeyRateLimitMax,
        buyerKeyRateLimitWindowMs,
        buyerKeyDefaultSpendLimitUsd,
        buyerMaxRequestBudgetUsd,
      },
      workerIsolation,
    });
  });
}
