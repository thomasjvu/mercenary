import { type FastifyInstance } from 'fastify';
import {
  parseAgentHeartbeatInput,
  parseProviderDiscoveryQuery,
  parseProviderRegistrationInput,
} from '@bossraid/api-contracts';
import { probeRegisteredProviderHealth } from '../lib/provider-health.js';
import {
  buildProviderVerificationFromHealth,
  buildProviderVerificationRegistrationInput,
} from '../lib/account.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, registryToken } = ctx;
  const { registryIsAuthorized } = handlers.auth;
  const { ensureErc8004ProofState } = handlers.raid;
  const { serializeProviderProfile, serializeProviderHealth } = handlers;

  app.post('/agents/register', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const provider = await orchestrator.upsertRegisteredProvider(
      parseProviderRegistrationInput(request.body)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });

  app.post('/agents/:providerId/verify', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const providerId = (request.params as { providerId: string }).providerId;
    const provider = orchestrator
      .listProviders()
      .find((item) => item.providerId === providerId || item.agentId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const health = await probeRegisteredProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const updatedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return {
      provider: serializeProviderProfile(updatedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });

  app.post('/agents/heartbeat', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const provider = await orchestrator.recordAgentHeartbeat(
      parseAgentHeartbeatInput(request.body)
    );
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });

  app.get('/agents/discover', async (request) => {
    await ensureErc8004ProofState({ includeMercenary: false });
    return (await orchestrator.discoverProviders(parseProviderDiscoveryQuery(request.query))).map(
      (provider) => serializeProviderProfile(provider)
    );
  });
}
