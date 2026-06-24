import { type FastifyInstance } from 'fastify';
import { marketplaceStatsSchema, openAiModelListSchema } from '@bossraid/openapi-schemas';
import { publicRouteSchema } from '../openapi/audience.js';
import {
  buildInferenceMarkets,
  buildInferenceMarketSnapshot,
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

function buildPublicMarketplaceStats(
  providers: ReturnType<ApiContext['orchestrator']['listProviders']>,
  controlState: ApiContext['controlState']
) {
  const activeOffers = providers.filter(
    (provider) =>
      (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.status !== 'offline'
  ).length;
  const sellerPayouts = controlState.listSellerPayouts(
    providers.map((provider) => provider.providerId),
    MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT
  );
  const metrics24h = computeSellerPayout24hMetrics(sellerPayouts);
  const modelsLive = mergeInferenceCatalogMarkets(
    buildInferenceMarkets(
      providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active' && provider.modelId
      )
    )
  ).length;

  return {
    activeOffers,
    sellerOffersActive: providers.filter(
      (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active'
    ).length,
    modelsLive,
    routedRequests24h: metrics24h.routedRequests24h,
    earnedBySellers24hUsd: metrics24h.earnedBySellers24hUsd,
  };
}

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  _handlers: ApiHandlerGroups
): void {
  const { orchestrator, env, controlState } = ctx;
  const listSnapshotMarkets = (query: ReturnType<typeof parseMarketplaceQuery>) =>
    buildInferenceMarketSnapshot(orchestrator.listProviders(), query);

  app.get(
    '/v1/models',
    {
      schema: publicRouteSchema({
        tags: ['Marketplace'],
        summary: 'List OpenAI-compatible marketplace models',
        response: {
          200: openAiModelListSchema,
        },
      }),
    },
    async (request) => {
      const markets = listSnapshotMarkets(parseMarketplaceQuery(request.query));

      return {
        object: 'list',
        data: markets.map((market) => buildOpenAiCompatibleModelEntry(market)),
      };
    }
  );

  app.get(
    '/v1/prices',
    {
      schema: publicRouteSchema({
        tags: ['Marketplace'],
        summary: 'List marketplace price cards',
        response: {
          200: openAiModelListSchema,
        },
      }),
    },
    async (request) => {
      return {
        object: 'list',
        benchmark: {
          source: 'models.dev',
          url: 'https://models.dev/api.json',
          mode: 'static_reference_only',
        },
        data: listSnapshotMarkets(parseMarketplaceQuery(request.query)).map((market) =>
          buildInferencePriceEntry(market)
        ),
      };
    }
  );

  app.get(
    '/v1/markets',
    {
      schema: publicRouteSchema({
        tags: ['Marketplace'],
        summary: 'Marketplace snapshot with stats and settlement policy',
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
            properties: {
              object: { type: 'string' },
              stats: marketplaceStatsSchema,
              data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      }),
    },
    async (request) => {
      const marketData = listSnapshotMarkets(parseMarketplaceQuery(request.query));
      const providers = orchestrator.listProviders();
      const stats = buildPublicMarketplaceStats(providers, controlState);

      return {
        object: 'list',
        stats: {
          activeOffers: stats.activeOffers,
          modelsLive: marketData.length,
          routedRequests24h: stats.routedRequests24h,
          earnedBySellers24hUsd: stats.earnedBySellers24hUsd,
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
    }
  );

  app.get(
    '/v1/marketplace/stats',
    {
      schema: publicRouteSchema({
        tags: ['Marketplace'],
        summary: 'Public marketplace counters',
        response: {
          200: marketplaceStatsSchema,
        },
      }),
    },
    async () => {
      const providers = orchestrator.listProviders();
      return buildPublicMarketplaceStats(providers, controlState);
    }
  );
}
