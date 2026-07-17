export type SupportedLanguage = 'csharp' | 'typescript' | 'python' | 'solidity' | 'text';
export type SupportedFramework = 'unity' | 'node' | 'react' | 'foundry' | 'django' | 'fastapi';
export type OutputType = 'text' | 'json' | 'image' | 'video' | 'patch' | 'bundle';
export type PrivacyRoutingMode = 'off' | 'prefer' | 'strict';
export type SelectionMode =
  | 'best_match'
  | 'privacy_first'
  | 'cost_first'
  | 'diverse_mix'
  | 'round_robin';
export type AgentFramework =
  | 'codex'
  | 'claude_code'
  | 'openclaw'
  | 'grok'
  | 'glm'
  | 'chutes'
  | 'custom';
export type ProviderVerificationStatus = 'pending' | 'verified' | 'failed' | 'error';
export type ProviderPricingMode = 'token_metered' | 'task';
export type ProviderPricingCurrency = 'USD' | 'USDC';
export type PrivacyFeatureKey =
  | 'tee_attested'
  | 'e2ee'
  | 'no_data_retention'
  | 'signed_outputs'
  | 'provenance_attested'
  | 'operator_verified';

export type ProviderStatus = 'available' | 'degraded' | 'offline';
export type MarketplaceOfferStatus = 'active' | 'paused';

/** Pure chat API vs agent harness (CLI/tool loop). */
export type HarnessLane = 'api_chat' | 'agent_harness';
/** Whether the harness image is stock or has skills installed. */
export type HarnessInstallation = 'fresh' | 'skill_augmented' | 'unknown';
export type HarnessProfileVerification = 'unverified' | 'heartbeat_self_report' | 'image_attested';
/**
 * Seller-declared credential class for buyer filters (not vendor-verified).
 * - api_key: platform/upstream API key intended for multi-tenant apps
 * - plan_or_cli: consumer/CLI/subscription login on the seller worker (seller owns ToS risk)
 * - unknown: not disclosed
 */
export type CredentialClass = 'api_key' | 'plan_or_cli' | 'unknown';

export interface HarnessSkillRef {
  id: string;
  name?: string;
  version?: string;
  contentHash?: string;
}

/**
 * Discloses whether buyers get a pure model/harness install or one with skills.
 * Hosted API offers default to api_chat + fresh; agent workers must report skills.
 */
export interface HarnessProfile {
  lane: HarnessLane;
  installation: HarnessInstallation;
  skills: HarnessSkillRef[];
  imageDigest?: string;
  compositionHash?: string;
  framework?: AgentFramework | string;
  planProvider?: string;
  attestedAt?: string;
  verification?: HarnessProfileVerification;
  /** Seller-declared; used for buyer filters. Not proof of vendor plan status. */
  credentialClass?: CredentialClass;
}

export interface ProviderReputation {
  globalScore: number;
  responsivenessScore: number;
  validityScore: number;
  qualityScore: number;
  timeoutRate: number;
  duplicateRate: number;
  specializationScores: Record<string, number>;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalRaids: number;
  totalSuccessfulRaids: number;
}

export interface ProviderPrivacy {
  score?: number;
  teeAttested?: boolean;
  teeVendor?: string;
  e2ee?: boolean;
  noDataRetention?: boolean;
  signedOutputs?: boolean;
  provenanceAttested?: boolean;
  operatorVerified?: boolean;
}

export interface ProviderScores {
  privacyScore: number;
  reputationScore: number;
}

export interface Erc8004Identity {
  agentId: string;
  operatorWallet?: string;
  registrationTx?: string;
  identityRegistry?: string;
  reputationRegistry?: string;
  validationRegistry?: string;
  validationTxs?: string[];
  lastVerifiedAt?: string;
  verification?: Erc8004Verification;
}

export interface Erc8004Verification {
  status: 'not_checked' | 'verified' | 'partial' | 'failed' | 'error';
  checkedAt: string;
  chainId?: string;
  agentRegistry?: string;
  owner?: string;
  agentUri?: string;
  registrationTxFound?: boolean;
  operatorMatchesOwner?: boolean;
  identityRegistryReachable?: boolean;
  reputationRegistryReachable?: boolean;
  validationRegistryReachable?: boolean;
  notes?: string[];
}

export interface ProviderTrust {
  score?: number;
  reason?: string;
  source?: 'erc8004';
}

export interface ProviderVerification {
  status: ProviderVerificationStatus;
  checkedAt?: string;
  apiVerified?: boolean;
  frameworkVerified?: boolean;
  modelVerified?: boolean;
  notes?: string[];
}

export interface ProviderSourceMetadata {
  type: string;
  targetType?: string;
  externalRef?: string;
  displayIcon?: string;
  memberCount?: number;
}

export interface ProviderPricing {
  mode: ProviderPricingMode;
  currency: ProviderPricingCurrency;
  pricePerTaskUsd?: number;
  pricePer1mInputTokensUsd?: number;
  pricePer1mOutputTokensUsd?: number;
  minimumChargeUsd?: number;
  validFrom?: string;
  validUntil?: string;
  rateCardVersion?: string;
  rateCardHash?: string;
  upstreamModelId?: string;
  maxContextTokens?: number;
}

export interface ProviderQuoteSnapshot {
  providerId: string;
  phase: 'primary' | 'reserve';
  rateCard: ProviderPricing;
  modelProvider?: string;
  modelId?: string;
  upstreamModelId?: string;
  maxContextTokens?: number;
  endpointHash: string;
  verificationStatus?: ProviderVerificationStatus;
  trustScore: number;
  privacyFeatures: PrivacyFeatureKey[];
  erc8004Registered: boolean;
  attestationSummary?: {
    teeAttested?: boolean;
    teeVendor?: string;
    e2ee?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
}

export interface ProviderProfile {
  providerId: string;
  agentId?: string;
  displayName: string;
  description?: string;
  endpointType: 'http';
  endpoint: string;
  specializations: string[];
  supportedLanguages: SupportedLanguage[];
  supportedFrameworks: string[];
  pricing?: ProviderPricing;
  pricePerTaskUsd: number;
  maxConcurrency: number;
  status: ProviderStatus;
  marketplaceOfferStatus?: MarketplaceOfferStatus;
  routingCooldownUntil?: string;
  modelFamily?: string;
  agentFramework?: AgentFramework;
  modelProvider?: string;
  modelId?: string;
  outputTypes?: OutputType[];
  verification?: ProviderVerification;
  privacy?: ProviderPrivacy;
  erc8004?: Erc8004Identity;
  trust?: ProviderTrust;
  reputation: ProviderReputation;
  scores?: ProviderScores;
  lastSeenAt?: string;
  auth?: ProviderAuthConfig;
  source?: ProviderSourceMetadata;
  harnessProfile?: HarnessProfile;
}

export interface ProviderRegistrationInput {
  agentId: string;
  name: string;
  description?: string;
  endpoint: string;
  capabilities?: string[];
  supportedLanguages?: SupportedLanguage[];
  supportedFrameworks?: string[];
  outputTypes?: OutputType[];
  modelFamily?: string;
  agentFramework?: AgentFramework;
  modelProvider?: string;
  modelId?: string;
  maxConcurrency?: number;
  marketplaceOfferStatus?: MarketplaceOfferStatus;
  source?: ProviderSourceMetadata;
  privacy?: ProviderPrivacy;
  erc8004?: Partial<Erc8004Identity>;
  trust?: Partial<ProviderTrust>;
  harnessProfile?: HarnessProfile;
  pricing?: {
    mode?: ProviderPricingMode;
    pricePerTaskUsd?: number;
    pricePer1mInputTokensUsd?: number;
    pricePer1mOutputTokensUsd?: number;
    minimumChargeUsd?: number;
    currency?: ProviderPricingCurrency;
    validFrom?: string;
    validUntil?: string;
    rateCardVersion?: string;
    rateCardHash?: string;
    upstreamModelId?: string;
    maxContextTokens?: number;
  };
  auth?: ProviderAuthConfig;
  verification?: ProviderVerification;
  reputation?: Partial<ProviderReputation>;
}

export interface AgentHeartbeatInput {
  agentId: string;
  status?: ProviderStatus;
  timestamp?: string;
}

export interface ProviderAuthConfig {
  type: 'bearer' | 'hmac' | 'none';
  token?: string;
  secret?: string;
  headerName?: string;
}

export interface ProviderHealthStatus {
  providerId: string;
  providerName?: string;
  endpoint: string;
  reachable: boolean;
  ready: boolean;
  statusCode?: number;
  missing?: string[];
  agentFramework?: AgentFramework;
  modelProvider?: string;
  model?: string | null;
  modelApiBase?: string;
  harnessProfile?: HarnessProfile;
  error?: string;
}

export function defaultApiChatHarnessProfile(
  overrides: Partial<HarnessProfile> = {}
): HarnessProfile {
  return {
    lane: 'api_chat',
    installation: 'fresh',
    skills: [],
    verification: 'unverified',
    credentialClass: 'api_key',
    ...overrides,
  };
}

export interface TeeAttestationResult {
  valid: boolean;
  providerId: string;
  verifiedAt: string;
  expiresAt?: string;
  vendor: string;
  enclaveHash?: string;
  signature?: string;
  runtimeMode?: string;
  notes?: string[];
  upstreamVendor?: string;
  signingAddress?: string;
  signingKey?: string;
  e2eeReady?: boolean;
  explorerUrl?: string;
  checks?: Array<{ id: string; passed: boolean; detail?: string }>;
}

export interface PrivacyAttestation {
  providerId: string;
  raidId: string;
  submittedAt: string;
  featuresClaimed: PrivacyFeatureKey[];
  featuresVerified: PrivacyFeatureKey[];
  teeAttestation?: TeeAttestationResult;
  inferenceReceiptId?: string;
  externalApiCalls: string[];
  dataRetained: boolean;
  signedDeclaration: string;
}
