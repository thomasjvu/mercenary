import type {
  AgentFramework,
  OutputType,
  PrivacyFeatureKey,
  PrivacyRoutingMode,
  ProviderQuoteSnapshot,
  ProviderVerificationStatus,
} from './provider.js';
import type {
  BossRaidRequest,
  BossRaidSpawnInput,
  BossRaidSpawnOutput,
  RaidContributionPlan,
  SanitizedTaskSpec,
} from './raid.js';

export interface RaidQuoteSnapshot {
  quoteId: string;
  createdAt: string;
  expiresAt: string;
  modelId?: string;
  selectedSellerIds: string[];
  reserveSellerIds: string[];
  privacyMode?: PrivacyRoutingMode;
  requiredPrivacyFeatures: PrivacyFeatureKey[];
  requiredVerificationStatus?: ProviderVerificationStatus;
  requireErc8004: boolean;
  minTrustScore?: number;
  estimatedMaxInputTokens?: number;
  estimatedMaxOutputTokens?: number;
  maxChargeUsd: number;
  manaQuote: {
    manaPerUsd: number;
    maxChargeMana: number;
  };
  providers: ProviderQuoteSnapshot[];
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  user?: string;
  raidRequest?: BossRaidSpawnInput;
  raidPolicy?: BossRaidRequest['raidPolicy'];
}

export interface ProviderDiscoveryQuery {
  capabilities?: string[];
  allowedModelFamilies?: string[];
  allowedAgentFrameworks?: AgentFramework[];
  allowedModelProviders?: string[];
  allowedModelIds?: string[];
  allowedOutputTypes?: OutputType[];
  privacyMode?: PrivacyRoutingMode;
  requirePrivacyFeatures?: PrivacyFeatureKey[];
  requireErc8004?: boolean;
  minTrustScore?: number;
  requiredVerificationStatus?: ProviderVerificationStatus;
  minReputationScore?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  onlineOnly?: boolean;
  maxHeartbeatAgeMs?: number;
  sourceType?: string;
  supportedFramework?: string;
}

export interface ReservedSelectedProviders {
  primaries: string[];
  reserves: string[];
}

export interface ReservedRaidNode {
  task: SanitizedTaskSpec;
  contributionPlan?: RaidContributionPlan;
  selectedProviders?: ReservedSelectedProviders;
  children?: ReservedRaidNode[];
}

export interface RaidLaunchReservationRecord {
  id: string;
  route: 'raid' | 'chat' | 'inference';
  requestKey: string;
  createdAt: string;
  expiresAt: string;
  paymentTimeoutSeconds?: number;
  deadlineUnix: number;
  mode: 'single' | 'hierarchical';
  sanitized: SanitizedTaskSpec;
  selectedProviders?: ReservedSelectedProviders;
  graph?: ReservedRaidNode;
  adaptiveProviderIds?: string[];
  reservedProviderIds: string[];
  quoteSnapshot?: RaidQuoteSnapshot;
  spawnOutput?: BossRaidSpawnOutput;
  x402PaidAmountUsd?: number;
  escrowFundingUsd?: number;
  platformMarkupUsd?: number;
}
