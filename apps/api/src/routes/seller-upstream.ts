import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import * as sellerUpstream from '../control-state/seller-upstream.js';
import { sanitizeSellerUpstreamConfig } from '../control-state/seller-upstream.js';
import {
  buildSelfServeProviderRegistrationInput,
  ensureRecordInput,
  ensureStringInput,
} from '../lib/account.js';
import { buildUpstreamSellerProviderId } from '../lib/inference-gateway.js';
import { verifyProviderByHealthProbe } from '../lib/provider-verification.js';
import { serializeProviderProfile } from '../lib/serializers.js';
import { buildHostedProviderRegistration } from '../lib/upstream-offers.js';
import {
  fetchUpstreamModels,
  mergeUpstreamCatalogModelsForProvider,
  parseUpstreamProviderParam,
} from '../lib/upstream/index.js';
import { verifyHostedModel } from '../lib/upstream/eligibility.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

const SELLER_UPSTREAM_RATE_MAX = 20;
const SELLER_UPSTREAM_RATE_WINDOW_MS = 60_000;

function invalidProviderReply(provider: string) {
  return {
    statusCode: 400,
    error: 'invalid_upstream_provider',
    message: `Unknown upstream provider '${provider}'. Expected one of: ${Object.keys(UPSTREAM_PROVIDER_CONFIG).join(', ')}.`,
  };
}

export function registerSellerUpstreamRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, controlState, env } = ctx;
  const { requirePublicSession } = handlers.auth;
  const { ensureErc8004ProofState } = handlers.raid;
  function requireSellerRateLimit(
    wallet: string
  ): { statusCode: number; error: string; message: string } | undefined {
    const result = controlState.consumeRateLimit(
      'seller-upstream',
      wallet.toLowerCase(),
      SELLER_UPSTREAM_RATE_MAX,
      SELLER_UPSTREAM_RATE_WINDOW_MS
    );
    if (!result.allowed) {
      return {
        statusCode: 429,
        error: 'rate_limited',
        message: `Retry after ${result.retryAfterSec}s.`,
      };
    }
    return undefined;
  }

  async function handleConnect(
    providerParam: string,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const provider = parseUpstreamProviderParam(providerParam);
    if (!provider) {
      reply.code(400);
      return invalidProviderReply(providerParam);
    }

    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const rateLimitError = requireSellerRateLimit(session.wallet);
    if (rateLimitError) {
      reply.code(rateLimitError.statusCode);
      return rateLimitError;
    }

    const body = ensureRecordInput(request.body, 'seller_upstream_connect');
    const apiKey = ensureStringInput(
      body.apiKey ?? body.api_key,
      'seller_upstream_connect.api_key'
    );

    try {
      const upstreamModels = await fetchUpstreamModels(provider, apiKey, { env });
      const candidates = mergeUpstreamCatalogModelsForProvider(provider, upstreamModels)
        .filter((model) => model.offerable)
        .sort(
          (a, b) =>
            (a.referenceOutputPer1mUsd ?? Infinity) - (b.referenceOutputPer1mUsd ?? Infinity)
        );
      if (candidates.length === 0) {
        reply.code(400);
        return {
          error: 'no_supported_models',
          message:
            'The key lists models, but none have supported chat metadata and pricing in the current catalog.',
        };
      }
      // Try multiple accessible models so one retired alias cannot reject a valid key.
      let verified = false;
      for (const model of candidates.slice(0, 3)) {
        try {
          await verifyHostedModel({
            provider,
            apiKey,
            modelId: model.modelId,
            upstreamModelId: model.upstreamModelId,
            env,
          });
          verified = true;
          break;
        } catch {
          /* Try the next inexpensive model. */
        }
      }
      if (!verified)
        throw new Error(
          'The accessible model probes failed. Check account credits and model access.'
        );
    } catch (error) {
      reply.code(400);
      return {
        error: `invalid_${provider}_api_key`,
        message: error instanceof Error ? error.message : 'Upstream validation failed.',
      };
    }

    try {
      const config = controlState.upsertSellerUpstreamConfig(session.wallet, provider, apiKey, env);
      return {
        object: `seller.${provider}.config`,
        config: sanitizeSellerUpstreamConfig(config),
      };
    } catch (error) {
      if (error instanceof sellerUpstream.SellerUpstreamEncryptionRequiredError) {
        reply.code(503);
        return {
          error: 'encryption_required',
          message: error.message,
        };
      }
      throw error;
    }
  }

  async function handleCatalogModels(providerParam: string, reply: FastifyReply) {
    const provider = parseUpstreamProviderParam(providerParam);
    if (!provider) {
      reply.code(400);
      return invalidProviderReply(providerParam);
    }

    const models = mergeUpstreamCatalogModelsForProvider(provider, []);
    return {
      object: 'list',
      provider,
      catalogOnly: true,
      supportedCount: models.length,
      upstreamFoundCount: 0,
      data: models,
    };
  }

  async function handleModels(providerParam: string, request: FastifyRequest, reply: FastifyReply) {
    const provider = parseUpstreamProviderParam(providerParam);
    if (!provider) {
      reply.code(400);
      return invalidProviderReply(providerParam);
    }

    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const apiKey = controlState.readSellerUpstreamApiKey(session.wallet, provider, env);
    if (!apiKey) {
      reply.code(400);
      return {
        error: `${provider}_not_connected`,
        message: `Connect a ${UPSTREAM_PROVIDER_CONFIG[provider].displayName} API key before listing models.`,
      };
    }

    try {
      const upstreamModels = await fetchUpstreamModels(provider, apiKey, { env });
      const models = mergeUpstreamCatalogModelsForProvider(provider, upstreamModels);
      const supportedCount = models.filter((model) => model.supported).length;
      const upstreamFoundCount = models.filter((model) => model.upstreamFound).length;

      return {
        object: 'list',
        provider,
        upstreamCount: upstreamModels.length,
        supportedCount,
        upstreamFoundCount,
        data: models,
      };
    } catch (error) {
      reply.code(502);
      return {
        error: `${provider}_upstream_error`,
        message: error instanceof Error ? error.message : `Failed to fetch ${provider} models.`,
      };
    }
  }

  async function handleOffers(providerParam: string, request: FastifyRequest, reply: FastifyReply) {
    const provider = parseUpstreamProviderParam(providerParam);
    if (!provider) {
      reply.code(400);
      return invalidProviderReply(providerParam);
    }

    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const rateLimitError = requireSellerRateLimit(session.wallet);
    if (rateLimitError) {
      reply.code(rateLimitError.statusCode);
      return rateLimitError;
    }

    const apiKey = controlState.readSellerUpstreamApiKey(session.wallet, provider, env);
    if (!apiKey) {
      reply.code(400);
      return {
        error: `${provider}_not_connected`,
        message: `Connect a ${UPSTREAM_PROVIDER_CONFIG[provider].displayName} API key before publishing offers.`,
      };
    }

    const body = ensureRecordInput(request.body, 'seller_upstream_offers');
    const modelIdsRaw = body.modelIds ?? body.model_ids;
    if (!Array.isArray(modelIdsRaw) || modelIdsRaw.some((item) => typeof item !== 'string')) {
      reply.code(400);
      return { error: 'invalid_model_ids', message: 'modelIds must be a string array.' };
    }

    const modelIds = [...new Set(modelIdsRaw.map((item) => item.trim()).filter(Boolean))];
    if (modelIds.length === 0) {
      reply.code(400);
      return { error: 'invalid_model_ids', message: 'Select at least one model.' };
    }

    const discountPercentRaw = body.discountPercent ?? body.discount_percent;
    const discountPercent =
      typeof discountPercentRaw === 'number'
        ? discountPercentRaw
        : typeof discountPercentRaw === 'string'
          ? Number(discountPercentRaw)
          : 0;
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 99) {
      reply.code(400);
      return {
        error: 'invalid_discount',
        message: 'discountPercent must be between 0 and 99.',
      };
    }

    const requestedPayoutWallet =
      typeof body.payoutWallet === 'string'
        ? body.payoutWallet
        : typeof body.payout_wallet === 'string'
          ? body.payout_wallet
          : undefined;
    if (
      requestedPayoutWallet &&
      requestedPayoutWallet.toLowerCase() !== session.wallet.toLowerCase()
    ) {
      reply.code(400);
      return {
        error: 'payout_wallet_mismatch',
        message: 'payoutWallet must match your signed-in wallet.',
      };
    }
    const payoutWallet = session.wallet;

    const published: Array<{
      modelId: string;
      providerId: string;
      verificationStatus: string;
    }> = [];

    const laneRaw = body.lane ?? body.offerLane ?? body.offer_lane;
    const lane = laneRaw === 'harness' || laneRaw === 'agent_harness' ? 'harness' : 'chat';

    const pauseExisting = async (modelId: string, reason: string) => {
      const existing = orchestrator
        .listProviders()
        .filter(
          (p) =>
            p.source?.externalRef === session.wallet.toLowerCase() &&
            p.source?.targetType === provider &&
            p.modelId === modelId
        );
      for (const profile of existing)
        await orchestrator.pauseRegisteredProvider(profile.providerId, reason);
    };
    let availableModels;
    try {
      availableModels = mergeUpstreamCatalogModelsForProvider(
        provider,
        await fetchUpstreamModels(provider, apiKey, { env })
      );
    } catch {
      reply.code(502);
      return {
        error: 'upstream_unavailable',
        message: 'Could not refresh account models. No offers were published.',
      };
    }
    const rejected: Array<{ modelId: string; state: string; reason: string }> = [];
    for (const modelId of modelIds) {
      const available = availableModels.find((model) => model.modelId === modelId);
      if (!available?.offerable) {
        await pauseExisting(modelId, 'Model is no longer available or supported.');
        rejected.push({
          modelId,
          state: available?.state ?? 'catalog_only',
          reason: 'Model is unavailable or lacks supported pricing.',
        });
        continue;
      }
      try {
        await verifyHostedModel({
          provider,
          apiKey,
          modelId,
          upstreamModelId: available.upstreamModelId,
          env,
        });
      } catch {
        await pauseExisting(modelId, 'Live completion or attestation probe failed.');
        rejected.push({
          modelId,
          state: 'live_failed',
          reason: 'Completion or attestation probe failed.',
        });
        continue;
      }
      const registration = buildHostedProviderRegistration({
        provider,
        wallet: session.wallet,
        modelId,
        discountPercent,
        payoutWallet,
        env,
        lane,
      });
      if (!registration) {
        rejected.push({
          modelId,
          state: 'live_failed',
          reason: 'The selected offer lane is not supported for this provider.',
        });
        continue;
      }

      if (registration.pricing) registration.pricing.upstreamModelId = available.upstreamModelId;
      const providerProfile = await orchestrator.upsertRegisteredProvider(
        parseProviderRegistrationInput(registration),
        { allowTakeover: false }
      );
      controlState.linkSellerProvider(session.wallet, providerProfile.providerId);

      const { provider: verifiedProvider } = await verifyProviderByHealthProbe(
        orchestrator,
        providerProfile,
        { controlState }
      );
      if (verifiedProvider.verification?.status !== 'verified') {
        await orchestrator.pauseRegisteredProvider(
          verifiedProvider.providerId,
          'Hosted gateway health check failed.'
        );
        rejected.push({
          modelId,
          state: 'live_failed',
          reason: 'Hosted gateway health check failed.',
        });
        continue;
      }
      await ensureErc8004ProofState({ includeMercenary: false, providers: [verifiedProvider] });

      published.push({
        modelId,
        providerId: verifiedProvider.providerId,
        verificationStatus: verifiedProvider.verification?.status ?? 'pending',
      });
    }

    if (published.length === 0) {
      reply.code(400);
      return {
        error: 'no_supported_models',
        message: 'No selected model passed availability, pricing, and completion checks.',
        rejected,
      };
    }

    reply.code(201);
    return {
      object: `seller.${provider}.offers`,
      provider,
      lane,
      discountPercent,
      payoutWallet,
      rejected,
      providers: published.map((entry) => {
        const profile = orchestrator
          .listProviders()
          .find((item) => item.providerId === entry.providerId);
        return {
          ...entry,
          state: 'live_supported',
          provider: profile
            ? serializeProviderProfile(profile, { includeEndpoint: true })
            : undefined,
        };
      }),
    };
  }

  for (const provider of Object.keys(UPSTREAM_PROVIDER_CONFIG) as UpstreamProviderId[]) {
    app.post(`/v1/seller/upstream/${provider}/connect`, async (request, reply) =>
      handleConnect(provider, request, reply)
    );
    app.get(`/v1/seller/upstream/${provider}/models/catalog`, async (_request, reply) =>
      handleCatalogModels(provider, reply)
    );
    app.get(`/v1/seller/upstream/${provider}/models`, async (request, reply) =>
      handleModels(provider, request, reply)
    );
    app.post(`/v1/seller/upstream/${provider}/offers`, async (request, reply) =>
      handleOffers(provider, request, reply)
    );
    app.get(`/v1/seller/upstream/${provider}/config`, async (request, reply) => {
      const session = requirePublicSession(reply, request.headers);
      if ('error' in session) {
        return session;
      }

      const config = controlState.readSellerUpstreamConfig(session.wallet, provider);
      if (!config) {
        return { object: `seller.${provider}.config`, configured: false, provider };
      }

      return {
        object: `seller.${provider}.config`,
        configured: true,
        provider,
        config: sanitizeSellerUpstreamConfig(config),
      };
    });

    app.delete(`/v1/seller/upstream/${provider}/offers/:modelId`, async (request, reply) => {
      const session = requirePublicSession(reply, request.headers);
      if ('error' in session) {
        return session;
      }

      const modelId = (request.params as { modelId: string }).modelId;
      const providerId = buildUpstreamSellerProviderId(provider, session.wallet, modelId);
      if (!controlState.sellerOwnsProvider(session.wallet, providerId)) {
        reply.code(404);
        return { error: 'not_found' };
      }

      const profile = orchestrator.listProviders().find((item) => item.providerId === providerId);
      if (!profile) {
        reply.code(404);
        return { error: 'not_found' };
      }

      const updated = await orchestrator.upsertRegisteredProvider(
        parseProviderRegistrationInput(
          buildSelfServeProviderRegistrationInput(
            { marketplaceOfferStatus: 'paused' },
            session.wallet,
            profile
          )
        ),
        { allowTakeover: false }
      );

      return serializeProviderProfile(updated, { includeEndpoint: true });
    });
  }

  app.get('/v1/seller/upstream/status', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const configs = controlState.listSellerUpstreamConfigs(session.wallet);
    return {
      object: 'seller.upstream.status',
      providers: configs.map((config) => sanitizeSellerUpstreamConfig(config)),
    };
  });
}
