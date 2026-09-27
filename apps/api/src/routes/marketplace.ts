import { type FastifyInstance } from 'fastify';
import { ROBINHOOD_CHAIN_CAIP2, ROBINHOOD_USDG_SYMBOL } from '@bossraid/constants';
import { marketplaceStatsSchema, openAiModelListSchema } from '@bossraid/openapi-schemas';
import { publicRouteSchema } from '../openapi/audience.js';
import {
  buildInferenceMarketSnapshot,
  countLiveMarketplaceModels,
  buildOpenAiCompatibleModelEntry,
  buildInferencePriceEntry,
  resolveProviderMarketModelId,
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
      (provider.marketplaceOfferStatus ?? 'active') === 'active' &&
      provider.status === 'available' &&
      Boolean(resolveProviderMarketModelId(provider))
  ).length;
  const sellerPayouts = controlState.listSellerPayouts(
    providers.map((provider) => provider.providerId),
    MARKETPLACE_PUBLIC_PAYOUT_SCAN_LIMIT
  );
  const metrics24h = computeSellerPayout24hMetrics(sellerPayouts);
  const modelsLive = countLiveMarketplaceModels(providers);

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
  const listSnapshotMarkets = (
    providers: ReturnType<ApiContext['orchestrator']['listProviders']>,
    query: ReturnType<typeof parseMarketplaceQuery>
  ) => buildInferenceMarketSnapshot(providers, query);

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
      const markets = listSnapshotMarkets(
        orchestrator.listProviders(),
        parseMarketplaceQuery(request.query)
      );

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
          source: 'catalog_snapshot',
          url: 'https://models.dev/api.json',
          mode: 'static_reference_only',
        },
        data: listSnapshotMarkets(
          orchestrator.listProviders(),
          parseMarketplaceQuery(request.query)
        ).map((market) => buildInferencePriceEntry(market)),
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
      const providers = orchestrator.listProviders();
      const marketData = listSnapshotMarkets(providers, parseMarketplaceQuery(request.query));
      const stats = buildPublicMarketplaceStats(providers, controlState);

      return {
        object: 'list',
        stats: {
          activeOffers: stats.activeOffers,
          modelsLive: stats.modelsLive,
          routedRequests24h: stats.routedRequests24h,
          earnedBySellers24hUsd: stats.earnedBySellers24hUsd,
        },
        settlement: {
          asset: ROBINHOOD_USDG_SYMBOL,
          network: env.BOSSRAID_X402_NETWORK ?? ROBINHOOD_CHAIN_CAIP2,
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
