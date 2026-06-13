import { type FastifyInstance } from 'fastify';
import {
  buildInferenceMarkets,
  mergeInferenceCatalogMarkets,
  buildOpenAiCompatibleModelEntry,
  buildInferencePriceEntry,
} from '../lib/inference-marketplace.js';
import { parseMarketplaceQuery } from '../lib/marketplace-query.js';
import {
  computeSellerPayout24hMetrics,
  MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT,
} from '../marketplace-stats.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, env, controlState } = ctx;
  const { buildInferenceMarketSnapshot } = handlers.raid;

  app.get('/v1/models', async (request) => {
    const markets = buildInferenceMarketSnapshot(parseMarketplaceQuery(request.query));

    return {
      object: 'list',
      data: markets.map((market) => buildOpenAiCompatibleModelEntry(market)),
    };
  });

  app.get('/v1/prices', async (request) => {
    return {
      object: 'list',
      benchmark: {
        source: 'models.dev',
        url: 'https://models.dev/api.json',
        mode: 'static_reference_only',
      },
      data: buildInferenceMarketSnapshot(parseMarketplaceQuery(request.query)).map((market) =>
        buildInferencePriceEntry(market)
      ),
    };
  });

  app.get('/v1/markets', async (request) => {
    const marketData = buildInferenceMarketSnapshot(parseMarketplaceQuery(request.query));
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
    const markets = mergeInferenceCatalogMarkets(
      buildInferenceMarkets(
        providers.filter(
          (provider) =>
            (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.modelId
        )
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
