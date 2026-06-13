import { type FastifyInstance } from 'fastify';
import {
  parseProviderFailure,
  parseProviderHeartbeat,
  parseProviderSubmission,
} from '@bossraid/api-contracts';
import { probeAllProviderHealth } from '../lib/provider-health.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerProviderRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, providerSubmissionBodyLimitBytes } = ctx;
  const { providerIsAuthorized, requireAdmin } = handlers.auth;
  const { validateProviderCallback, ensureErc8004ProofState } = handlers.raid;
  const { serializeProviderProfile, serializeProviderHealth } = handlers;

  app.post('/v1/providers/:providerId/heartbeat', async (request, reply) => {
    const params = request.params as { providerId: string };
    if (
      !providerIsAuthorized(params.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const heartbeat = parseProviderHeartbeat(request.body, params.providerId);
    const validation = validateProviderCallback(
      heartbeat.raidId,
      params.providerId,
      heartbeat.providerRunId
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderHeartbeat(heartbeat.raidId, params.providerId, heartbeat);
  });

  app.post(
    '/v1/providers/:providerId/submit',
    { bodyLimit: providerSubmissionBodyLimitBytes },
    async (request, reply) => {
      const params = request.params as { providerId: string };
      if (
        !providerIsAuthorized(params.providerId, {
          method: request.method,
          path: request.url,
          body: request.body,
          headers: request.headers,
        })
      ) {
        reply.code(401);
        return { error: 'unauthorized' };
      }
      const submission = parseProviderSubmission(request.body, params.providerId);
      const validation = validateProviderCallback(
        submission.raidId,
        params.providerId,
        submission.providerRunId
      );
      if (!validation.ok) {
        reply.code(validation.statusCode);
        return validation.body;
      }
      return orchestrator.recordProviderSubmission(submission.raidId, submission);
    }
  );

  app.post('/v1/providers/:providerId/failure', async (request, reply) => {
    const params = request.params as { providerId: string };
    if (
      !providerIsAuthorized(params.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const failure = parseProviderFailure(request.body, params.providerId);
    const validation = validateProviderCallback(
      failure.raidId,
      params.providerId,
      failure.providerRunId
    );
    if (!validation.ok) {
      reply.code(validation.statusCode);
      return validation.body;
    }
    return orchestrator.recordProviderFailure(failure.raidId, params.providerId, failure);
  });

  app.get('/v1/providers', async () => {
    const providers = orchestrator.listProviders();
    await ensureErc8004ProofState({ includeMercenary: false, providers });
    return providers.map((provider) => serializeProviderProfile(provider));
  });

  app.get('/v1/providers/health', async () =>
    (await probeAllProviderHealth(orchestrator)).map((health) => serializeProviderHealth(health))
  );

  app.get('/v1/providers/:providerId/stats', async (request, reply) => {
    const adminError = requireAdmin(reply, request.headers);
    if (adminError) {
      return adminError;
    }

    const providerId = (request.params as { providerId: string }).providerId;
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    await ensureErc8004ProofState({ includeMercenary: false, providers: [provider] });
    return serializeProviderProfile(provider, { includeEndpoint: true });
  });
}
