import { type FastifyInstance } from 'fastify';
import {
  buildInferenceMarkets,
  buildOpenAiCompatibleModelEntry,
  buildInferencePriceEntry,
} from '../lib/inference-marketplace.js';
import { readPositiveNumber } from '../lib/env.js';
import { asSingleQueryValue } from '../lib/http.js';
import {
  computeSellerPayout24hMetrics,
  MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT,
} from '../marketplace-stats.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlers } from '../api-handlers.js';

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlers
): void {
  const { orchestrator, env, controlState } = ctx;
  const { buildInferenceMarketSnapshot } = handlers;

  app.get('/v1/models', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    const markets = buildInferenceMarketSnapshot({
      modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
      modelProvider: asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
      agentFramework:
        asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
      maxBudgetUsd: readPositiveNumber(
        asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
      ),
      privacyMode: asSingleQueryValue(query.privacy_mode),
      verificationStatus: asSingleQueryValue(query.verification_status),
    });

    return {
      object: 'list',
      data: markets.map((market) => buildOpenAiCompatibleModelEntry(market)),
    };
  });

  app.get('/v1/prices', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    return {
      object: 'list',
      benchmark: {
        source: 'models.dev',
        url: 'https://models.dev/api.json',
        mode: 'static_reference_only',
      },
      data: buildInferenceMarketSnapshot({
        modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
        modelProvider:
          asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
        agentFramework:
          asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
        maxBudgetUsd: readPositiveNumber(
          asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
        ),
        privacyMode: asSingleQueryValue(query.privacy_mode),
        verificationStatus: asSingleQueryValue(query.verification_status),
      }).map((market) => buildInferencePriceEntry(market)),
    };
  });

  app.get('/v1/markets', async (request) => {
    const query = request.query as {
      model?: unknown;
      model_id?: unknown;
      provider?: unknown;
      model_provider?: unknown;
      framework?: unknown;
      agent_framework?: unknown;
      max_budget?: unknown;
      max_budget_usd?: unknown;
      privacy_mode?: unknown;
      verification_status?: unknown;
    };
    const marketData = buildInferenceMarketSnapshot({
      modelId: asSingleQueryValue(query.model_id) ?? asSingleQueryValue(query.model),
      modelProvider: asSingleQueryValue(query.model_provider) ?? asSingleQueryValue(query.provider),
      agentFramework:
        asSingleQueryValue(query.agent_framework) ?? asSingleQueryValue(query.framework),
      maxBudgetUsd: readPositiveNumber(
        asSingleQueryValue(query.max_budget_usd) ?? asSingleQueryValue(query.max_budget)
      ),
      privacyMode: asSingleQueryValue(query.privacy_mode),
      verificationStatus: asSingleQueryValue(query.verification_status),
    });
    const providers = orchestrator.listProviders();
    const activeOffers = providers.filter(
      (provider) =>
        (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.status !== 'offline'
    ).length;
    const sellerPayouts = controlState.listSellerPayouts(
      providers.map((provider) => provider.providerId),
      MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT
    );
    const metrics24h = computeSellerPayout24hMetrics(sellerPayouts);

    return {
      object: 'list',
      stats: {
        activeOffers,
        modelsLive: marketData.length,
        routedRequests24h: metrics24h.routedRequests24h,
        earnedBySellers24hUsd: metrics24h.earnedBySellers24hUsd,
      },
      settlement: {
        asset: 'USDC',
        network: env.BOSSRAID_X402_NETWORK ?? 'base-sepolia',
        rule: 'single-provider inference pays the selected successful seller its declared rate; multi-agent raids split successful payouts equally.',
      },
      custody: {
        sellerCredentialPolicy:
          'Sellers expose clean authenticated endpoints. Boss Raid does not require buyers to receive seller provider keys or subscription credentials.',
        privacyPolicy:
          'Strict private routing requires privacy metadata and Phala/TEE attestation where configured.',
      },
      data: marketData,
    };
  });

  app.get('/v1/marketplace/stats', async () => {
    const providers = orchestrator.listProviders();
    const markets = buildInferenceMarkets(
      providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.modelId
      )
    );
    const sellerPayouts = controlState.listSellerPayouts(
      providers.map((provider) => provider.providerId),
      MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT
    );
    const metrics24h = computeSellerPayout24hMetrics(sellerPayouts);
    return {
      activeOffers: providers.filter(
        (provider) =>
          (provider.marketplaceOfferStatus ?? 'active') === 'active' &&
          provider.status !== 'offline'
      ).length,
      sellerOffersActive: providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active'
      ).length,
      modelsLive: markets.length,
      routedRequests24h: metrics24h.routedRequests24h,
      earnedBySellers24hUsd: metrics24h.earnedBySellers24hUsd,
    };
  });
}
