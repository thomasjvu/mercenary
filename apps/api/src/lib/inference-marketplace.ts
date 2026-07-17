import {
  INFERENCE_MODEL_CATALOG,
  MARKETPLACE_BENCHMARK_PRICING,
  MARKETPLACE_REFERENCE_INPUT_TOKENS,
  MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
  resolveMarketplacePrivacyTier,
  type InferenceCatalogEntry,
  type MarketplacePrivacyTier,
} from '@bossraid/constants';
import { providerMatchesMarketplaceConstraints } from '@bossraid/provider-registry';
import { readProviderPricing } from '@bossraid/raid-core';
import {
  type ChatCompletionRequest,
  type ProviderProfile,
  type ProviderVerificationStatus,
} from '@bossraid/shared-types';
import {
  forceDiscountInferenceChatPolicy,
  readPolicyStringArray,
  readTrustedAlkahestClient,
  STRICT_PRIVATE_PRIVACY_FEATURES,
} from './inference-marketplace-policy.js';
import { filterEligibleMarketplaceProviders } from './inference-marketplace-query.js';
import {
  estimateTokenMeteredMarketRateUsd,
  readProviderMarketRateUsd,
  resolveProviderMarketModelId,
} from './inference-marketplace-rates.js';
import type { MarketplaceQueryParams } from './marketplace-query.js';

export {
  MARKETPLACE_REFERENCE_INPUT_TOKENS,
  MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
  estimateTokenMeteredMarketRateUsd,
  readProviderMarketRateUsd,
  resolveProviderMarketModelId,
};
export { forceDiscountInferenceChatPolicy, readTrustedAlkahestClient };
export { filterEligibleMarketplaceProviders };

export interface InferenceMarketSeller {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: string;
  rateUsd: number;
  pricing: {
    unit: 'task' | 'token_metered';
    pricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    minimumChargeUsd: number | null;
    currency: string;
    validFrom?: string;
    validUntil?: string;
    rateCardVersion?: string;
    rateCardHash?: string;
    upstreamModelId?: string;
    maxContextTokens?: number;
  };
  status: ProviderProfile['status'];
  marketplaceOfferStatus: 'active' | 'paused';
  verificationStatus?: string;
  privacy: {
    teeAttested?: boolean;
    e2ee?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
  outputTypes?: string[];
  maxConcurrency: number;
}

export interface InferenceMarket {
  object: 'inference.market';
  modelId: string;
  modelProvider?: string;
  /** Buyer-facing privacy taxonomy (not host Phala CVM TEE). */
  privacyTier?: MarketplacePrivacyTier;
  providerCount: number;
  activeProviderCount: number;
  verifiedSellerCount: number;
  privateSellerCount: number;
  /** Sellers with upstream TEE claims */
  teeSellerCount?: number;
  /** Sellers with anonymous/private indirection (non-TEE privacy) */
  anonymousSellerCount?: number;
  recentSuccessRate: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  cheapestRateUsd: number | null;
  pricing: {
    benchmarkSource: 'models.dev';
    benchmarkUrl: 'https://models.dev/api.json';
    benchmarkMode: 'static_reference_only';
    declaredUnit: 'task' | 'token_metered';
    cheapestPricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    referenceInputTokens: number | null;
    referenceOutputTokens: number | null;
  };
  sellers: InferenceMarketSeller[];
}

export function buildInferenceMarketSnapshot(
  providers: ProviderProfile[],
  options: MarketplaceQueryParams = {}
): InferenceMarket[] {
  const filteredProviders = filterEligibleMarketplaceProviders(providers, options);
  const markets = mergeInferenceCatalogMarkets(buildInferenceMarkets(filteredProviders));
  if (options.modelId) {
    return markets.filter((market) => market.modelId === options.modelId);
  }
  if (options.modelProvider) {
    return markets.filter((market) => market.modelProvider === options.modelProvider);
  }
  return markets;
}

function readPrivacyMode(
  value: unknown
): NonNullable<ChatCompletionRequest['raidPolicy']>['privacyMode'] {
  return value === 'off' || value === 'prefer' || value === 'strict' ? value : undefined;
}

export function resolveDiscountInferenceDefaultMaxTotalCost(
  chatRequest: ChatCompletionRequest,
  providers: ProviderProfile[]
): number | undefined {
  const policy = (chatRequest.raidPolicy ?? {}) as Record<string, unknown>;
  if (policy.maxTotalCost != null || policy.max_total_cost != null) {
    return undefined;
  }

  const modelIds = readPolicyStringArray(policy.allowedModelIds ?? policy.allowed_model_ids) ?? [
    chatRequest.model,
  ];
  const modelProviders = readPolicyStringArray(
    policy.allowedModelProviders ?? policy.allowed_model_providers
  );
  const agentFrameworks = readPolicyStringArray(
    policy.allowedAgentFrameworks ?? policy.allowed_agent_frameworks
  );
  const requiredVerificationStatus =
    typeof policy.requiredVerificationStatus === 'string'
      ? policy.requiredVerificationStatus
      : typeof policy.required_verification_status === 'string'
        ? policy.required_verification_status
        : undefined;
  const privacyMode = readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode);
  const requireErc8004 = policy.requireErc8004 === true || policy.require_erc8004 === true;
  const minTrustScoreValue = Number(policy.minTrustScore ?? policy.min_trust_score);
  const minTrustScore = Number.isFinite(minTrustScoreValue) ? minTrustScoreValue : undefined;
  const rates = providers
    .filter((provider) => {
      if (
        provider.status !== 'available' ||
        !Number.isFinite(readProviderMarketRateUsd(provider))
      ) {
        return false;
      }

      return providerMatchesMarketplaceConstraints(
        provider,
        {
          allowedModelIds: modelIds,
          allowedModelProviders: modelProviders,
          allowedAgentFrameworks: agentFrameworks,
          requiredVerificationStatus: requiredVerificationStatus as
            | ProviderVerificationStatus
            | undefined,
          privacyMode: privacyMode === 'strict' ? 'strict' : undefined,
          requirePrivacyFeatures:
            privacyMode === 'strict' ? [...STRICT_PRIVATE_PRIVACY_FEATURES] : undefined,
          requireErc8004,
          minTrustScore,
          onlineOnly: false,
        },
        { skipFreshnessCheck: true }
      );
    })
    .map((provider) => readProviderMarketRateUsd(provider))
    .sort((left, right) => left - right);

  return rates[0];
}

export function buildInferenceMarkets(providers: ProviderProfile[]): InferenceMarket[] {
  const byModel = new Map<string, ProviderProfile[]>();
  for (const provider of providers) {
    const modelId = resolveProviderMarketModelId(provider);
    if (!modelId) {
      continue;
    }
    byModel.set(modelId, [...(byModel.get(modelId) ?? []), provider]);
  }

  return [...byModel.entries()]
    .map(([modelId, marketProviders]) => {
      const sellers = marketProviders
        .map((provider) => buildInferenceMarketSeller(provider))
        .sort(
          (left, right) =>
            left.rateUsd - right.rateUsd || left.sellerId.localeCompare(right.sellerId)
        );
      const activeSellers = sellers.filter(
        (seller) =>
          seller.status === 'available' && (seller.marketplaceOfferStatus ?? 'active') === 'active'
      );
      const cheapestRateUsd = activeSellers[0]?.rateUsd ?? sellers[0]?.rateUsd ?? null;
      const declaredUnit: InferenceMarket['pricing']['declaredUnit'] = sellers.some(
        (seller) => seller.pricing.unit === 'token_metered'
      )
        ? 'token_metered'
        : 'task';
      const successfulRaids = marketProviders.reduce(
        (total, provider) => total + provider.reputation.totalSuccessfulRaids,
        0
      );
      const totalRaids = marketProviders.reduce(
        (total, provider) => total + provider.reputation.totalRaids,
        0
      );
      const latencies = marketProviders
        .map((provider) => provider.reputation.p50LatencyMs)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      const p95Latencies = marketProviders
        .map((provider) => provider.reputation.p95LatencyMs)
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      return {
        object: 'inference.market' as const,
        modelId,
        modelProvider:
          marketProviders.find((provider) => provider.modelProvider)?.modelProvider ?? undefined,
        providerCount: sellers.length,
        activeProviderCount: activeSellers.length,
        verifiedSellerCount: marketProviders.filter(
          (provider) => provider.verification?.status === 'verified'
        ).length,
        privateSellerCount: marketProviders.filter(
          (provider) =>
            provider.privacy?.teeAttested ||
            provider.privacy?.e2ee ||
            provider.privacy?.signedOutputs ||
            provider.privacy?.noDataRetention ||
            resolveMarketplacePrivacyTier({
              teeAttested: provider.privacy?.teeAttested,
              e2ee: provider.privacy?.e2ee,
              modelProvider: provider.modelProvider,
            }) !== 'standard'
        ).length,
        teeSellerCount: marketProviders.filter((provider) => provider.privacy?.teeAttested).length,
        anonymousSellerCount: marketProviders.filter((provider) => {
          const tier = resolveMarketplacePrivacyTier({
            teeAttested: provider.privacy?.teeAttested,
            e2ee: provider.privacy?.e2ee,
            modelProvider: provider.modelProvider,
          });
          return tier === 'anonymous_private' || tier === 'e2ee';
        }).length,
        privacyTier: resolveMarketplacePrivacyTier({
          teeAttested: marketProviders.some((p) => p.privacy?.teeAttested),
          e2ee: marketProviders.some((p) => p.privacy?.e2ee),
          modelProvider: marketProviders.find((p) => p.modelProvider)?.modelProvider,
        }),
        recentSuccessRate: totalRaids > 0 ? successfulRaids / totalRaids : null,
        p50LatencyMs: latencies[0] ?? null,
        p95LatencyMs: p95Latencies[p95Latencies.length - 1] ?? null,
        cheapestRateUsd,
        pricing: {
          ...MARKETPLACE_BENCHMARK_PRICING,
          declaredUnit,
          cheapestPricePerTaskUsd: cheapestRateUsd,
          pricePer1mInputTokensUsd: null,
          pricePer1mOutputTokensUsd: null,
          referenceInputTokens: MARKETPLACE_REFERENCE_INPUT_TOKENS,
          referenceOutputTokens: MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
        },
        sellers,
      };
    })
    .sort((left, right) => {
      const leftRate = left.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
      const rightRate = right.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
      return leftRate - rightRate || left.modelId.localeCompare(right.modelId);
    });
}

function estimateCatalogReferenceRateUsd(entry: InferenceCatalogEntry): number {
  const input = (MARKETPLACE_REFERENCE_INPUT_TOKENS / 1_000_000) * entry.inputPer1mUsd;
  const output = (MARKETPLACE_REFERENCE_OUTPUT_TOKENS / 1_000_000) * entry.outputPer1mUsd;
  return Math.max(0.01, Number((input + output).toFixed(4)));
}

function applyCatalogReferencePricing(
  market: InferenceMarket,
  entry: InferenceCatalogEntry
): InferenceMarket {
  return {
    ...market,
    pricing: {
      ...market.pricing,
      pricePer1mInputTokensUsd: entry.inputPer1mUsd,
      pricePer1mOutputTokensUsd: entry.outputPer1mUsd,
      referenceInputTokens: MARKETPLACE_REFERENCE_INPUT_TOKENS,
      referenceOutputTokens: MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
    },
  };
}

function buildCatalogOnlyMarket(entry: InferenceCatalogEntry): InferenceMarket {
  const referenceRateUsd = estimateCatalogReferenceRateUsd(entry);
  const privacyTier = resolveMarketplacePrivacyTier({
    privacy: entry.privacy,
    teeAttested: entry.teeAttested,
    e2ee: entry.e2ee,
    modelProvider: entry.modelProvider,
  });
  const isPrivateish = privacyTier !== 'standard';
  return {
    object: 'inference.market',
    modelId: entry.modelId,
    modelProvider: entry.modelProvider,
    privacyTier,
    providerCount: 0,
    activeProviderCount: 0,
    verifiedSellerCount: 0,
    privateSellerCount: isPrivateish ? 1 : 0,
    teeSellerCount: entry.teeAttested ? 1 : 0,
    anonymousSellerCount: privacyTier === 'anonymous_private' || privacyTier === 'e2ee' ? 1 : 0,
    recentSuccessRate: null,
    p50LatencyMs: null,
    p95LatencyMs: null,
    cheapestRateUsd: referenceRateUsd,
    pricing: {
      ...MARKETPLACE_BENCHMARK_PRICING,
      declaredUnit: 'token_metered',
      cheapestPricePerTaskUsd: referenceRateUsd,
      pricePer1mInputTokensUsd: entry.inputPer1mUsd,
      pricePer1mOutputTokensUsd: entry.outputPer1mUsd,
      referenceInputTokens: MARKETPLACE_REFERENCE_INPUT_TOKENS,
      referenceOutputTokens: MARKETPLACE_REFERENCE_OUTPUT_TOKENS,
    },
    sellers: [],
  };
}

/** Static catalog-only markets (no live sellers) — built once per process. */
let catalogOnlyMarketsById: Map<string, InferenceMarket> | null = null;
let catalogEntryByModelId: Map<string, InferenceCatalogEntry> | null = null;

function getCatalogEntryByModelId(): Map<string, InferenceCatalogEntry> {
  if (!catalogEntryByModelId) {
    catalogEntryByModelId = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));
  }
  return catalogEntryByModelId;
}

function getCatalogOnlyMarketsById(): Map<string, InferenceMarket> {
  if (!catalogOnlyMarketsById) {
    catalogOnlyMarketsById = new Map(
      INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, buildCatalogOnlyMarket(entry)])
    );
  }
  return catalogOnlyMarketsById;
}

/**
 * Overlay live seller markets onto the static catalog.
 * Catalog-only rows are cloned from a process-level cache (not rebuilt every request).
 */
export function mergeInferenceCatalogMarkets(liveMarkets: InferenceMarket[]): InferenceMarket[] {
  const catalogEntries = getCatalogEntryByModelId();
  const catalogOnly = getCatalogOnlyMarketsById();
  const merged = new Map<string, InferenceMarket>();

  for (const market of liveMarkets) {
    const entry = catalogEntries.get(market.modelId);
    merged.set(market.modelId, entry ? applyCatalogReferencePricing(market, entry) : market);
  }

  for (const [modelId, catalogMarket] of catalogOnly) {
    if (!merged.has(modelId)) {
      // Shallow clone so callers cannot mutate the shared cache entry.
      merged.set(modelId, { ...catalogMarket, pricing: { ...catalogMarket.pricing }, sellers: [] });
    }
  }

  return [...merged.values()].sort((left, right) => {
    const leftRate = left.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
    const rightRate = right.cheapestRateUsd ?? Number.POSITIVE_INFINITY;
    return leftRate - rightRate || left.modelId.localeCompare(right.modelId);
  });
}

/** Distinct live model ids among active sellers — avoids full catalog merge for stats. */
export function countLiveMarketplaceModels(providers: ProviderProfile[]): number {
  const ids = new Set<string>();
  for (const provider of providers) {
    if ((provider.marketplaceOfferStatus ?? 'active') !== 'active') {
      continue;
    }
    if (provider.status === 'offline') {
      continue;
    }
    if (provider.modelId) {
      ids.add(provider.modelId);
    }
  }
  return ids.size;
}

function buildInferenceMarketSeller(provider: ProviderProfile): InferenceMarketSeller {
  const pricing = readProviderPricing(provider);
  return {
    sellerId: provider.providerId,
    displayName: provider.displayName,
    modelProvider: provider.modelProvider,
    agentFramework: provider.agentFramework,
    rateUsd: readProviderMarketRateUsd(provider),
    pricing: {
      unit: pricing.mode,
      pricePerTaskUsd: pricing.pricePerTaskUsd ?? null,
      pricePer1mInputTokensUsd: pricing.pricePer1mInputTokensUsd ?? null,
      pricePer1mOutputTokensUsd: pricing.pricePer1mOutputTokensUsd ?? null,
      minimumChargeUsd: pricing.minimumChargeUsd ?? null,
      currency: pricing.currency,
      validFrom: pricing.validFrom,
      validUntil: pricing.validUntil,
      rateCardVersion: pricing.rateCardVersion,
      rateCardHash: pricing.rateCardHash,
      upstreamModelId: pricing.upstreamModelId,
      maxContextTokens: pricing.maxContextTokens,
    },
    status: provider.status,
    marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
    verificationStatus: provider.verification?.status,
    privacy: {
      teeAttested: provider.privacy?.teeAttested,
      e2ee: provider.privacy?.e2ee,
      signedOutputs: provider.privacy?.signedOutputs,
      noDataRetention: provider.privacy?.noDataRetention,
    },
    outputTypes: provider.outputTypes,
    maxConcurrency: provider.maxConcurrency,
  };
}

export function providerHasStrictPrivateMarketMetadata(provider: ProviderProfile): boolean {
  return Boolean(
    provider.privacy?.teeAttested &&
    provider.privacy?.e2ee &&
    provider.privacy?.signedOutputs &&
    provider.privacy?.noDataRetention
  );
}

export function buildOpenAiCompatibleModelEntry(market: InferenceMarket) {
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === market.modelId);
  return {
    id: market.modelId,
    object: 'model',
    created: 0,
    owned_by: market.modelProvider ?? catalogEntry?.modelProvider ?? 'bossraid-market',
    pricing: market.pricing,
    bossraid: {
      display_name: catalogEntry?.displayName ?? market.modelId,
      provider_count: market.providerCount,
      active_provider_count: market.activeProviderCount,
      verified_seller_count: market.verifiedSellerCount,
      private_seller_count: market.privateSellerCount,
      privacy_tier: market.privacyTier,
      tee_seller_count: market.teeSellerCount,
      anonymous_seller_count: market.anonymousSellerCount,
      cheapest_rate_usd: market.cheapestRateUsd,
      catalog_only: market.providerCount === 0,
      settlement_asset: 'USDG',
      route: '/v1/inference/chat/completions',
    },
  };
}

export function buildInferencePriceEntry(market: InferenceMarket) {
  return {
    modelId: market.modelId,
    modelProvider: market.modelProvider,
    cheapestRateUsd: market.cheapestRateUsd,
    declaredUnit: market.pricing.declaredUnit,
    pricePer1mInputTokensUsd: market.pricing.pricePer1mInputTokensUsd,
    pricePer1mOutputTokensUsd: market.pricing.pricePer1mOutputTokensUsd,
    providerCount: market.providerCount,
    activeProviderCount: market.activeProviderCount,
    verifiedSellerCount: market.verifiedSellerCount,
    privateSellerCount: market.privateSellerCount,
    recentSuccessRate: market.recentSuccessRate,
    p50LatencyMs: market.p50LatencyMs,
    p95LatencyMs: market.p95LatencyMs,
    sellers: market.sellers.map((seller) => ({
      sellerId: seller.sellerId,
      rateUsd: seller.rateUsd,
      pricing: seller.pricing,
      status: seller.status,
      verificationStatus: seller.verificationStatus,
    })),
  };
}
