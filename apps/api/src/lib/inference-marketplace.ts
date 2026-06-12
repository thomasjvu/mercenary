import { estimateTokenMeteredUsd, readProviderPricing } from '@bossraid/raid-core';
import {
  type ChatCompletionRequest,
  type ProviderPricing,
  type ProviderProfile,
  asSingleHeader,
} from '@bossraid/shared-types';

/** Reference profile for comparing token-metered sellers on the public marketplace. */
export const MARKETPLACE_REFERENCE_INPUT_TOKENS = 1_000;
export const MARKETPLACE_REFERENCE_OUTPUT_TOKENS = 1_024;

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
  providerCount: number;
  activeProviderCount: number;
  verifiedSellerCount: number;
  privateSellerCount: number;
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

export function forceDiscountInferenceChatPolicy(
  chatRequest: ChatCompletionRequest,
  options: {
    defaultMaxTotalCost?: number;
    strictAlkahestLane?: boolean;
  } = {}
): ChatCompletionRequest {
  const policy = (chatRequest.raidPolicy ?? {}) as Record<string, unknown>;
  const existingAllowedModelIds = readPolicyStringArray(
    policy.allowedModelIds ?? policy.allowed_model_ids
  );
  const existingAllowedOutputTypes = readPolicyStringArray(
    policy.allowedOutputTypes ?? policy.allowed_output_types
  );
  const maxTotalCost = policy.maxTotalCost ?? policy.max_total_cost ?? options.defaultMaxTotalCost;
  const privacyMode = options.strictAlkahestLane
    ? 'strict'
    : (readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode) ?? 'prefer');
  const requiredPrivacyFeatures = options.strictAlkahestLane
    ? (['tee_attested', 'e2ee', 'signed_outputs', 'no_data_retention'] as NonNullable<
        ChatCompletionRequest['raidPolicy']
      >['requirePrivacyFeatures'])
    : undefined;

  return {
    ...chatRequest,
    raidPolicy: {
      ...chatRequest.raidPolicy,
      maxAgents: 1,
      maxTotalCost: maxTotalCost as number | string | undefined,
      allowedModelIds:
        existingAllowedModelIds && existingAllowedModelIds.length > 0
          ? existingAllowedModelIds
          : [chatRequest.model],
      allowedOutputTypes:
        existingAllowedOutputTypes && existingAllowedOutputTypes.length > 0
          ? (existingAllowedOutputTypes as NonNullable<
              ChatCompletionRequest['raidPolicy']
            >['allowedOutputTypes'])
          : ['text', 'json'],
      privacyMode,
      requirePrivacyFeatures:
        requiredPrivacyFeatures ?? chatRequest.raidPolicy?.requirePrivacyFeatures,
      requireErc8004: options.strictAlkahestLane ? true : chatRequest.raidPolicy?.requireErc8004,
      minTrustScore: options.strictAlkahestLane
        ? Math.max(Number(policy.minTrustScore ?? policy.min_trust_score ?? 0), 80)
        : chatRequest.raidPolicy?.minTrustScore,
      requiredVerificationStatus: options.strictAlkahestLane
        ? 'verified'
        : chatRequest.raidPolicy?.requiredVerificationStatus,
      allowedModelProviders: options.strictAlkahestLane
        ? ['google']
        : chatRequest.raidPolicy?.allowedModelProviders,
      selectionMode: 'cost_first',
    },
  };
}

export function readTrustedAlkahestClient(
  headers: Record<string, string | string[] | undefined>
): { sourceAppId: 'alkahest' } | undefined {
  const clientId = asSingleHeader(headers['x-bossraid-client-id']);
  const sourceAppId = asSingleHeader(headers['x-bossraid-source-app-id']);
  if (clientId !== 'alkahest' && sourceAppId !== 'alkahest') {
    return undefined;
  }
  return { sourceAppId: 'alkahest' };
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
      if ((provider.marketplaceOfferStatus ?? 'active') === 'paused') {
        return false;
      }
      if (modelIds.length > 0 && !provider.modelId) {
        return false;
      }
      if (modelIds.length > 0 && provider.modelId && !modelIds.includes(provider.modelId)) {
        return false;
      }
      if (
        modelProviders &&
        modelProviders.length > 0 &&
        (!provider.modelProvider || !modelProviders.includes(provider.modelProvider))
      ) {
        return false;
      }
      if (
        agentFrameworks &&
        agentFrameworks.length > 0 &&
        (!provider.agentFramework || !agentFrameworks.includes(provider.agentFramework))
      ) {
        return false;
      }
      if (
        requiredVerificationStatus &&
        provider.verification?.status !== requiredVerificationStatus
      ) {
        return false;
      }
      if (privacyMode === 'strict' && !providerHasStrictPrivateMarketMetadata(provider)) {
        return false;
      }
      if (requireErc8004 && !provider.erc8004?.agentId) {
        return false;
      }
      if (
        typeof minTrustScore === 'number' &&
        (provider.trust?.score ?? (provider.erc8004?.registrationTx ? 80 : 0)) < minTrustScore
      ) {
        return false;
      }
      return (
        provider.status === 'available' && Number.isFinite(readProviderMarketRateUsd(provider))
      );
    })
    .map((provider) => readProviderMarketRateUsd(provider))
    .sort((left, right) => left - right);

  return rates[0];
}

function readPolicyStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

export function resolveProviderMarketModelId(provider: ProviderProfile): string | undefined {
  return provider.modelId ?? provider.modelFamily;
}

export function estimateTokenMeteredMarketRateUsd(
  pricing: Pick<
    ProviderPricing,
    'pricePer1mInputTokensUsd' | 'pricePer1mOutputTokensUsd' | 'minimumChargeUsd'
  >,
  referenceInputTokens = MARKETPLACE_REFERENCE_INPUT_TOKENS,
  referenceOutputTokens = MARKETPLACE_REFERENCE_OUTPUT_TOKENS
): number {
  return estimateTokenMeteredUsd(pricing, referenceInputTokens, referenceOutputTokens);
}

export function readProviderMarketRateUsd(provider: ProviderProfile): number {
  const pricing = readProviderPricing(provider);
  if (pricing.mode === 'task') {
    return pricing.pricePerTaskUsd ?? provider.pricePerTaskUsd;
  }
  return estimateTokenMeteredMarketRateUsd(pricing);
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
            provider.privacy?.signedOutputs ||
            provider.privacy?.noDataRetention
        ).length,
        recentSuccessRate: totalRaids > 0 ? successfulRaids / totalRaids : null,
        p50LatencyMs: latencies[0] ?? null,
        p95LatencyMs: p95Latencies[p95Latencies.length - 1] ?? null,
        cheapestRateUsd,
        pricing: {
          benchmarkSource: 'models.dev' as const,
          benchmarkUrl: 'https://models.dev/api.json' as const,
          benchmarkMode: 'static_reference_only' as const,
          declaredUnit,
          cheapestPricePerTaskUsd: cheapestRateUsd,
          pricePer1mInputTokensUsd:
            activeSellers.find((seller) => seller.pricing.pricePer1mInputTokensUsd != null)?.pricing
              .pricePer1mInputTokensUsd ?? null,
          pricePer1mOutputTokensUsd:
            activeSellers.find((seller) => seller.pricing.pricePer1mOutputTokensUsd != null)
              ?.pricing.pricePer1mOutputTokensUsd ?? null,
          referenceInputTokens:
            declaredUnit === 'token_metered' ? MARKETPLACE_REFERENCE_INPUT_TOKENS : null,
          referenceOutputTokens:
            declaredUnit === 'token_metered' ? MARKETPLACE_REFERENCE_OUTPUT_TOKENS : null,
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
  return {
    id: market.modelId,
    object: 'model',
    created: 0,
    owned_by: market.modelProvider ?? 'bossraid-market',
    pricing: market.pricing,
    bossraid: {
      provider_count: market.providerCount,
      active_provider_count: market.activeProviderCount,
      verified_seller_count: market.verifiedSellerCount,
      private_seller_count: market.privateSellerCount,
      cheapest_rate_usd: market.cheapestRateUsd,
      settlement_asset: 'USDC',
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
