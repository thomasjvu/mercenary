import { type FastifyInstance } from 'fastify';
import {
  parseAgentHeartbeatInput,
  parseProviderDiscoveryQuery,
  parseProviderRegistrationInput,
} from '@bossraid/api-contracts';
import { buildProviderProfileFromRegistration } from '@bossraid/provider-sdk';
import { serializeProviderHealth, serializeProviderProfile } from '../lib/serializers.js';
import {
  probeProviderHealthForRegistration,
  verifyProviderByHealthProbe,
} from '../lib/provider-verification.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, registryToken, controlState } = ctx;
  const { registryIsAuthorized } = handlers.auth;
  const { ensureErc8004ProofState } = handlers.raid;
  app.post('/agents/register', async (request, reply) => {
    if (!registryToken) {
      reply.code(503);
      return { error: 'registry_auth_not_configured' };
    }
    if (!registryIsAuthorized(request.headers)) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const registration = parseProviderRegistrationInput(request.body);
    const candidate = buildProviderProfileFromRegistration(registration);
    const health = await probeProviderHealthForRegistration(candidate, { controlState });
    if (health.ready !== true) {
      reply.code(503);
      return {
        error: 'provider_not_ready',
        message: health.error ?? 'Provider health probe failed.',
        health: serializeProviderHealth(health, {
          includeDiagnostics: true,
          includeEndpoint: true,
        }),
      };
    }

    // Registry token is privileged and may reassign endpoints intentionally.
    const provider = await orchestrator.upsertRegisteredProvider(registration, {
      allowTakeover: true,
    });
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

    const { provider: updatedProvider, health } = await verifyProviderByHealthProbe(
      orchestrator,
      provider
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
