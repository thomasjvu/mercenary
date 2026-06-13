import { type FastifyInstance } from 'fastify';
import { readSettlementMode, readStorageBackend } from '@bossraid/constants';
import { isSettlementGateConfigured } from '../lib/settlement-mode.js';
import { readTeeSocketState } from '../lib/tee.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';

import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, env, apiMetrics, metricsPublic } = ctx;
  const { requireAdmin } = handlers.auth;
  const { collectProviderHealth } = handlers.raid;

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
    const settlementMode = readSettlementMode(env);
    const settlementConfigured = isSettlementGateConfigured(settlementMode, env);
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
}
