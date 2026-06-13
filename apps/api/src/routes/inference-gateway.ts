import { type FastifyInstance } from 'fastify';
import { verifyProviderAuth } from '@bossraid/provider-sdk';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import { createProviderRunId, runInferenceGatewayJob } from '../lib/inference-gateway-runner.js';
import {
  isHostedInferenceProvider,
  resolveHostedProviderUpstream,
} from '../lib/inference-gateway-health.js';
import { type ApiContext } from '../api-context.js';

function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

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

    const wallet = provider.source?.externalRef;
    const upstream = resolveHostedProviderUpstream(provider);
    const configured =
      wallet && upstream ? Boolean(controlState.readSellerUpstreamConfig(wallet, upstream)) : false;

    return {
      ok: configured,
      ready: configured,
      missing: configured ? [] : [`BOSSRAID_${(upstream ?? 'UPSTREAM').toUpperCase()}_API_KEY`],
      providerId: provider.providerId,
      providerName: provider.displayName,
      agentFramework: provider.agentFramework ?? 'custom',
      modelProvider: provider.modelProvider ?? upstream ?? 'unknown',
      model: provider.modelId ?? null,
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
