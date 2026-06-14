import { type FastifyInstance } from 'fastify';
import { verifyProviderAuth } from '@bossraid/provider-sdk';
import { asSingleHeader, type ProviderTaskPackage } from '@bossraid/shared-types';
import {
  createProviderRunId,
  isHostedInferenceProvider,
  probeHostedInferenceProviderHealth,
  resolveHostedProviderUpstream,
  runInferenceGatewayJob,
} from '../lib/inference-gateway.js';
import { type ApiContext } from '../api-context.js';

type GatewayAcceptBody = {
  raidId: string;
  providerId: string;
  task: ProviderTaskPackage;
  deadlineUnix: number;
};

export function registerInferenceGatewayRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const { orchestrator, controlState } = ctx;

  app.get('/gateway/:providerId/health', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider || !isHostedInferenceProvider(provider)) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const health = probeHostedInferenceProviderHealth(controlState, provider);
    const upstream = resolveHostedProviderUpstream(provider);

    return {
      ok: health.ready === true,
      ready: health.ready === true,
      missing: health.missing ?? [],
      providerId: health.providerId,
      providerName: health.providerName,
      agentFramework: health.agentFramework,
      modelProvider: health.modelProvider,
      model: health.model,
      upstream,
    };
  });

  app.post('/gateway/:providerId/v1/raid/accept', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider || !isHostedInferenceProvider(provider)) {
      reply.code(404);
      return { error: 'not_found' };
    }

    if (
      !verifyProviderAuth({
        auth: provider.auth,
        providerId: provider.providerId,
        method: request.method,
        path: request.url,
        body: JSON.stringify(request.body ?? {}),
        headers: request.headers,
        authorizationHeader: asSingleHeader(request.headers.authorization),
        timestampHeader: asSingleHeader(request.headers['x-bossraid-timestamp']),
        signatureHeader: asSingleHeader(request.headers['x-bossraid-signature']),
        providerIdHeader: asSingleHeader(request.headers['x-bossraid-provider-id']),
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const wallet = provider.source?.externalRef;
    const upstream = resolveHostedProviderUpstream(provider);
    const configured =
      wallet && upstream ? Boolean(controlState.readSellerUpstreamConfig(wallet, upstream)) : false;
    if (!configured) {
      reply.code(503);
      return {
        error: 'upstream_not_configured',
        message: `${upstream ?? 'Upstream'} API key is not configured for this seller.`,
      };
    }

    const body = request.body as GatewayAcceptBody;
    const providerRunId = createProviderRunId();

    void runInferenceGatewayJob({
      orchestrator,
      controlState,
      inferenceReceiptStore: ctx.inferenceReceiptStore,
      provider,
      body,
      providerRunId,
      env: ctx.env,
    });

    return {
      accepted: true,
      providerId,
      providerRunId,
      upstream,
    };
  });
}
