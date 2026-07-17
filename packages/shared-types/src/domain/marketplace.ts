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

/** OpenAI-compatible reasoning effort (xAI Grok / Grok Build). */
export type ChatReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  user?: string;
  /** Passed through to xAI when supported (Grok CLI: /model … high|medium|low). */
  reasoning_effort?: ChatReasoningEffort;
  /**
   * Discount-inference ergonomic filter: `auto` (default) or upstream id
   * (`venice` | `xai` | `darkbloom` | …) → raid_policy.allowed_model_providers.
   */
  provider?: string;
  /** Absolute max spend USD for this call (alias for raid_policy.max_total_cost). */
  max_price_usd?: number;
  /**
   * Cap spend as a fraction of catalog reference task price (0–1).
   * Applied when resolving max_total_cost; fails closed if no seller within budget.
   */
  max_price_ratio?: number;
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
  allowedInstallations?: Array<'fresh' | 'skill_augmented' | 'unknown'>;
  requiredSkills?: string[];
  allowedCredentialClasses?: Array<'api_key' | 'plan_or_cli' | 'unknown'>;
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
