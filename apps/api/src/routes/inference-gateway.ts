import { type FastifyInstance } from 'fastify';
import { verifyProviderAuth } from '@bossraid/provider-sdk';
import { asSingleHeader, type ProviderTaskPackage } from '@bossraid/shared-types';
import {
  createProviderRunId,
  isHostedHarnessProvider,
  isHostedInferenceProvider,
  probeHostedInferenceProviderHealth,
  rebuildGatewayTaskPackage,
  resolveHostedProviderUpstream,
  runHarnessGatewayJob,
  runInferenceGatewayJob,
} from '../lib/inference-gateway.js';
import { type ApiContext } from '../api-context.js';

type GatewayAcceptBody = {
  raidId: string;
  providerId: string;
  /** Ignored for execution — task is rebuilt from raid state. */
  task?: ProviderTaskPackage;
  deadlineUnix: number;
};

export function registerInferenceGatewayRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const { orchestrator, controlState } = ctx;

  app.get('/gateway/:providerId/health', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = orchestrator.getProviderProfile(providerId);
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
      harnessProfile: health.harnessProfile,
      harnessMode: isHostedHarnessProvider(provider) ? 'agent_harness' : 'api_chat',
      upstream,
    };
  });

  app.post('/gateway/:providerId/v1/raid/accept', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = orchestrator.getProviderProfile(providerId);
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
    if (
      !body ||
      typeof body.raidId !== 'string' ||
      typeof body.providerId !== 'string' ||
      body.providerId !== providerId ||
      typeof body.deadlineUnix !== 'number'
    ) {
      reply.code(400);
      return {
        error: 'invalid_request',
        message: 'raidId, providerId, and deadlineUnix are required.',
      };
    }

    const raid = orchestrator.getRaid(body.raidId);
    if (!raid) {
      reply.code(404);
      return { error: 'raid_not_found' };
    }

    const assignment = raid.assignments[providerId];
    if (!assignment || assignment.status === 'failed' || assignment.status === 'invalid') {
      reply.code(403);
      return { error: 'provider_not_assigned', message: 'Provider is not assigned to this raid.' };
    }

    const activeGatewayStatuses = new Set(['accepted', 'running', 'submitted']);
    if (assignment.providerRunId && activeGatewayStatuses.has(assignment.status)) {
      reply.code(409);
      return {
        error: 'job_already_active',
        message: 'Provider already has an active inference job for this raid.',
        providerRunId: assignment.providerRunId,
      };
    }

    // Execute only the orchestrator-authoritative task package (ignore client body.task).
    const task = rebuildGatewayTaskPackage({ raid, providerId, provider });
    const jobBody = {
      raidId: body.raidId,
      providerId,
      task,
      deadlineUnix: raid.deadlineUnix,
    };

    const providerRunId = createProviderRunId();
    const harnessSeat = isHostedHarnessProvider(provider);

    if (harnessSeat) {
      void runHarnessGatewayJob({
        orchestrator,
        controlState,
        provider,
        body: jobBody,
        providerRunId,
        env: ctx.env,
      });
    } else {
      void runInferenceGatewayJob({
        orchestrator,
        controlState,
        inferenceReceiptStore: ctx.inferenceReceiptStore,
        provider,
        body: jobBody,
        providerRunId,
        env: ctx.env,
      });
    }

    return {
      accepted: true,
      providerId,
      providerRunId,
      upstream,
      lane: harnessSeat ? 'harness' : 'chat',
    };
  });
}
