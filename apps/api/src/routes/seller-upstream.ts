import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import { UPSTREAM_PROVIDER_CONFIG, type UpstreamProviderId } from '@bossraid/constants';
import { sanitizeSellerUpstreamConfig } from '../control-state/seller-upstream.js';
import {
  buildProviderVerificationFromHealth,
  buildProviderVerificationRegistrationInput,
  buildSelfServeProviderRegistrationInput,
  ensureRecordInput,
  ensureStringInput,
} from '../lib/account.js';
import {
  isHostedInferenceProvider,
  probeHostedInferenceProviderHealth,
} from '../lib/inference-gateway-health.js';
import { probeRegisteredProviderHealth } from '../lib/provider-health.js';
import { buildUpstreamSellerProviderId } from '../lib/inference-gateway-base.js';
import { buildHostedProviderRegistration } from '../lib/upstream-offers.js';
import {
  fetchUpstreamModels,
  mergeUpstreamCatalogModelsForProvider,
  parseUpstreamProviderParam,
} from '../lib/upstream/index.js';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { verifyUpstreamTee } from '../lib/attestation-service.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

const SELLER_UPSTREAM_RATE_MAX = 20;
const SELLER_UPSTREAM_RATE_WINDOW_MS = 60_000;

function invalidProviderReply(provider: string) {
  return {
    statusCode: 400,
    error: 'invalid_upstream_provider',
    message: `Unknown upstream provider '${provider}'. Expected one of: venice, redpill, near, chutes, phala.`,
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
  const { serializeProviderProfile } = handlers;

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
      await fetchUpstreamModels(provider, apiKey);
    } catch (error) {
      reply.code(400);
      return {
        error: `invalid_${provider}_api_key`,
        message: error instanceof Error ? error.message : `${provider} API key validation failed.`,
      };
    }

    const teeSampleModel =
      INFERENCE_MODEL_CATALOG.find(
        (entry) => entry.attestationVendor === provider && entry.teeAttested
      )?.upstreamModelId ??
      INFERENCE_MODEL_CATALOG.find((entry) => entry.modelProvider === provider)?.upstreamModelId;

    if (teeSampleModel) {
      const { attestation } = await verifyUpstreamTee({
        provider,
        modelId: teeSampleModel,
        providerId: `seller:${session.wallet}:${provider}`,
        apiKey,
        env,
      });
      if (!attestation.valid) {
        reply.code(400);
        return {
          error: 'tee_preflight_failed',
          message: 'Upstream TEE attestation preflight failed for this API key.',
          checks: attestation.checks,
        };
      }
    }

    const config = controlState.upsertSellerUpstreamConfig(session.wallet, provider, apiKey, env);
    return {
      object: `seller.${provider}.config`,
      config: sanitizeSellerUpstreamConfig(config),
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
      const upstreamModels = await fetchUpstreamModels(provider, apiKey);
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

    const payoutWallet =
      typeof body.payoutWallet === 'string'
        ? body.payoutWallet
        : typeof body.payout_wallet === 'string'
          ? body.payout_wallet
          : session.wallet;

    const published: Array<{
      modelId: string;
      providerId: string;
      verificationStatus: string;
    }> = [];

    for (const modelId of modelIds) {
      const registration = buildHostedProviderRegistration({
        provider,
        wallet: session.wallet,
        modelId,
        discountPercent,
        payoutWallet,
        env,
      });
      if (!registration) {
        continue;
      }

      const providerProfile = await orchestrator.upsertRegisteredProvider(
        parseProviderRegistrationInput(registration)
      );
      controlState.linkSellerProvider(session.wallet, providerProfile.providerId);

      const health = isHostedInferenceProvider(providerProfile)
        ? probeHostedInferenceProviderHealth(controlState, providerProfile)
        : await probeRegisteredProviderHealth(providerProfile);
      const verification = buildProviderVerificationFromHealth(providerProfile, health);
      const verifiedProvider = await orchestrator.upsertRegisteredProvider(
        buildProviderVerificationRegistrationInput(providerProfile, verification)
      );
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
        message: 'None of the selected models are supported by Boss Raid.',
      };
    }

    reply.code(201);
    return {
      object: `seller.${provider}.offers`,
      provider,
      discountPercent,
      payoutWallet,
      providers: published.map((entry) => {
        const profile = orchestrator
          .listProviders()
          .find((item) => item.providerId === entry.providerId);
        return {
          ...entry,
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
        )
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
