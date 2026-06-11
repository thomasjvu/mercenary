import type {
  ProviderHealthStatus,
  ProviderProfile,
  ProviderViewResponse,
  ProviderHealthViewResponse,
  RaidListItemResponse,
  RaidRecord,
} from '@bossraid/shared-types';

export function serializeProviderProfile(
  provider: ProviderProfile,
  options: { includeEndpoint?: boolean } = {}
): ProviderViewResponse {
  return {
    providerId: provider.providerId,
    agentId: provider.agentId,
    displayName: provider.displayName,
    description: provider.description,
    endpointType: provider.endpointType,
    endpoint: options.includeEndpoint ? provider.endpoint : undefined,
    specializations: provider.specializations,
    supportedLanguages: provider.supportedLanguages,
    supportedFrameworks: provider.supportedFrameworks,
    pricing: provider.pricing,
    pricePerTaskUsd: provider.pricePerTaskUsd,
    maxConcurrency: provider.maxConcurrency,
    status: provider.status,
    modelFamily: provider.modelFamily,
    agentFramework: provider.agentFramework,
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    outputTypes: provider.outputTypes,
    verification: provider.verification,
    privacy: provider.privacy,
    erc8004: provider.erc8004,
    trust: provider.trust,
    reputation: provider.reputation,
    scores: provider.scores,
    lastSeenAt: provider.lastSeenAt,
    source: provider.source,
    marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
  };
}

export function serializeProviderHealth(
  health: ProviderHealthStatus,
  options: { includeDiagnostics?: boolean; includeEndpoint?: boolean } = {}
): ProviderHealthViewResponse {
  return {
    providerId: health.providerId,
    providerName: health.providerName,
    endpoint: options.includeEndpoint ? health.endpoint : undefined,
    reachable: health.reachable,
    ready: health.ready,
    statusCode: health.statusCode,
    model: health.model,
    missing: options.includeDiagnostics ? health.missing : undefined,
    modelApiBase: options.includeDiagnostics ? health.modelApiBase : undefined,
    error: options.includeDiagnostics ? health.error : undefined,
  };
}

export function toRaidListItemResponse(raid: RaidRecord): RaidListItemResponse {
  return {
    raidId: raid.id,
    status: raid.status,
    createdAt: raid.createdAt,
    updatedAt: raid.updatedAt,
    bestCurrentScore: raid.bestCurrentScore,
    firstValidSubmissionId: raid.firstValidSubmissionId,
    primarySubmissionId: raid.primarySubmissionId,
    successfulSubmissionCount: raid.rankedSubmissions.filter((item) => item.breakdown.valid).length,
  };
}
