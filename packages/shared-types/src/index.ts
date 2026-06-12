export * from './domain/provider.js';
export * from './domain/marketplace.js';
export * from './domain/raid.js';
export * from './domain/settlement.js';

export function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export {
  parseBoolean,
  readBooleanEnv,
  readPositiveInteger,
  readPositiveNumber,
} from '@bossraid/constants';

export type {
  ApiKeyCreateResponseView,
  AttestedEnvelopeResponse,
  AttestedRaidResultPayloadResponse,
  AttestedRuntimePayloadResponse,
  AuthNonceResponseView,
  BuyerApiKeyView,
  BuyerPurchaseView,
  BuyerPurchasesResponseView,
  ChatCompletionResponseView,
  InferenceMarketSellerView,
  InferenceMarketView,
  MarketplaceStatsView,
  MarketsResponseView,
  ModelsResponseView,
  OpenAiModelEntryView,
  OpsSessionStatusResponse,
  OpsSettingsResponse,
  OpsX402SettingsResponse,
  ProductionReadinessCheckResponse,
  ProductionReadinessResponse,
  SettlementStatusResponse,
  OpsMetricsRouteStatsResponse,
  OpsMetricsResponse,
  ProviderHealthViewResponse,
  ProviderViewResponse,
  PublicSessionView,
  RaidAgentLogResponse,
  RaidListItemResponse,
  RaidResultResponse,
  RaidRoutingProofResponse,
  RaidSpawnOutputResponse,
  RaidStatusResponse,
  RaidSynthesizedOutputResponse,
  RankedSubmissionResponse,
  SellerEarningsView,
  SellerProviderCreateResponseView,
  SellerStatsView,
  SettlementExecutionResponse,
  SettlementSummaryResponse,
  SubmissionArtifactView,
  TeeAttestationCheckView,
  TeeAttestationView,
  PrivacyAttestationView,
  PrivacyComplianceIssueView,
  PrivacyComplianceResultView,
  PrivacyComplianceRecordView,
} from './api-views.js';
