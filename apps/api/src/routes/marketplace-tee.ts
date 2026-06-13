import { type FastifyInstance } from 'fastify';
import { INFERENCE_MODEL_CATALOG, isUpstreamProviderId } from '@bossraid/constants';
import { verifyUpstreamAttestationReport } from '@bossraid/privacy-engine';
import { ensureRecordInput, ensureStringInput } from '../lib/account.js';
import { fetchUpstreamAttestationReport, generateAttestationNonce } from '../lib/upstream/index.js';
import { verifyUpstreamTee } from '../lib/attestation-service.js';
import { isUpstreamTeeMock } from '../lib/upstream-mock.js';
import { readPlatformUpstreamApiKey } from '../lib/upstream/credentials.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../api-handlers.js';

const attestationCache = new Map<
  string,
  { expiresAt: number; result: ReturnType<typeof verifyUpstreamAttestationReport> }
>();
const ATTESTATION_CACHE_TTL_MS = 10 * 60 * 1000;

export function registerMarketplaceTeeRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, controlState, env } = ctx;
  const { requirePublicSession, readPublicSession } = handlers.auth;

  app.post('/v1/marketplace/tee/attestation', async (request, reply) => {
    const body = ensureRecordInput(request.body, 'marketplace_tee_attestation');
    const provider = ensureStringInput(
      body.provider ?? body.upstream_provider,
      'marketplace_tee_attestation.provider'
    );
    const modelId = ensureStringInput(
      body.modelId ?? body.model_id,
      'marketplace_tee_attestation.model_id'
    );

    if (!isUpstreamProviderId(provider)) {
      reply.code(400);
      return {
        error: 'invalid_provider',
        message: 'provider must be venice, redpill, near, chutes, or phala.',
      };
    }

    const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === modelId);
    const sellerId =
      typeof body.sellerId === 'string'
        ? body.sellerId
        : typeof body.seller_id === 'string'
          ? body.seller_id
          : undefined;
    const instanceId =
      typeof body.instanceId === 'string'
        ? body.instanceId
        : typeof body.instance_id === 'string'
          ? body.instance_id
          : undefined;

    let apiKey = readPlatformUpstreamApiKey(provider, env);
    let providerId = `catalog:${provider}:${modelId}`;

    if (sellerId) {
      const seller = orchestrator.listProviders().find((item) => item.providerId === sellerId);
      const wallet = seller?.source?.externalRef;
      if (!wallet) {
        reply.code(404);
        return { error: 'seller_not_found', message: 'Seller provider not found.' };
      }
      apiKey = controlState.readSellerUpstreamApiKey(wallet, provider, env) ?? apiKey;
      providerId = sellerId;
    } else if (!apiKey) {
      const session = requirePublicSession(reply, request.headers);
      if ('error' in session) {
        return session;
      }
      apiKey = controlState.readSellerUpstreamApiKey(session.wallet, provider, env);
    } else {
      const session = readPublicSession(request.headers);
      if (session) {
        apiKey = controlState.readSellerUpstreamApiKey(session.wallet, provider, env) ?? apiKey;
      }
    }

    if (!apiKey) {
      reply.code(400);
      return {
        error: 'api_key_required',
        message: 'Connect seller upstream key or configure platform BOSSRAID_*_API_KEY.',
      };
    }

    const nonce = generateAttestationNonce();
    const { attestation: result } = await verifyUpstreamTee({
      provider,
      modelId: catalogEntry?.upstreamModelId ?? modelId,
      providerId,
      apiKey,
      instanceId,
      nonce,
      env,
    });

    const cacheKey = `${provider}:${modelId}:${sellerId ?? 'platform'}`;
    attestationCache.set(cacheKey, {
      expiresAt: Date.now() + ATTESTATION_CACHE_TTL_MS,
      result: {
        valid: result.valid,
        vendor: provider,
        modelId,
        nonce,
        verifiedAt: result.verifiedAt,
        signingAddress: result.signingAddress,
        serverVerified: result.valid,
        e2eeReady: result.e2eeReady,
        checks: result.checks ?? [],
        explorerUrl: result.explorerUrl,
      },
    });

    return {
      object: 'marketplace.tee.attestation',
      provider,
      modelId,
      valid: result.valid,
      verifiedAt: result.verifiedAt,
      signingAddress: result.signingAddress,
      signingKey: (result as { signingKey?: string }).signingKey,
      e2eeReady: result.e2eeReady,
      checks: result.checks,
      explorerUrl: result.explorerUrl,
      teeAttested: catalogEntry?.teeAttested ?? false,
      e2ee: catalogEntry?.e2ee ?? false,
    };
  });

  app.get('/v1/marketplace/models/:modelId/tee', async (request) => {
    const { modelId } = request.params as { modelId: string };
    const query = request.query as { sellerId?: string; seller_id?: string };
    const sellerId =
      typeof query.sellerId === 'string'
        ? query.sellerId
        : typeof query.seller_id === 'string'
          ? query.seller_id
          : undefined;
    const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === modelId);
    const provider = catalogEntry?.attestationVendor ?? catalogEntry?.modelProvider ?? 'venice';
    const cacheKey = `${provider}:${modelId}:${sellerId ?? 'platform'}`;
    const cached = attestationCache.get(cacheKey);
    const fresh = cached && cached.expiresAt > Date.now() ? cached.result : undefined;

    return {
      object: 'marketplace.model.tee',
      modelId,
      provider,
      teeAttested: catalogEntry?.teeAttested ?? false,
      e2ee: catalogEntry?.e2ee ?? false,
      lastAttestation: fresh
        ? {
            valid: fresh.valid,
            verifiedAt: fresh.verifiedAt,
            signingAddress: fresh.signingAddress,
            checks: fresh.checks,
            explorerUrl: fresh.explorerUrl,
          }
        : null,
    };
  });

  app.post('/v1/marketplace/tee/attestation/preflight', async (request, reply) => {
    const body = ensureRecordInput(request.body, 'marketplace_tee_preflight');
    const provider = ensureStringInput(body.provider, 'marketplace_tee_preflight.provider');
    const modelId = ensureStringInput(
      body.modelId ?? body.model_id,
      'marketplace_tee_preflight.model_id'
    );
    const apiKey = ensureStringInput(
      body.apiKey ?? body.api_key,
      'marketplace_tee_preflight.api_key'
    );

    if (!isUpstreamProviderId(provider)) {
      reply.code(400);
      return { error: 'invalid_provider' };
    }

    const nonce = generateAttestationNonce();
    const report = await fetchUpstreamAttestationReport({
      provider,
      apiKey,
      modelId,
      nonce,
      instanceId: typeof body.instanceId === 'string' ? body.instanceId : undefined,
    });
    const verified = verifyUpstreamAttestationReport({
      vendor: provider,
      modelId,
      nonce,
      report,
      mockMode: isUpstreamTeeMock(env),
    });

    return {
      object: 'marketplace.tee.preflight',
      ...verified,
      provider,
      modelId,
    };
  });
}
