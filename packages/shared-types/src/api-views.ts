export type RaidListItemResponse = {
  raidId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  bestCurrentScore?: number;
  firstValidSubmissionId?: number | string;
  primarySubmissionId?: string;
  successfulSubmissionCount?: number;
};

export type RaidStatusResponse = {
  raidId: string;
  status: string;
  experts: Array<{
    providerId: string;
    status: string;
    latencyMs?: number;
    heartbeatAgeMs?: number;
    progress?: number;
    message?: string;
  }>;
  firstValidAvailable: boolean;
  bestCurrentScore?: number;
  sanitization: {
    riskTier: string;
    redactedSecrets: number;
    redactedIdentifiers: number;
    trimmedFiles: number;
  };
};

export type SubmissionArtifactView = {
  outputType: string;
  label: string;
  uri: string;
  mimeType?: string;
  description?: string;
  sha256?: string;
};

export type RankedSubmissionResponse = {
  submission: {
    providerId: string;
    explanation: string;
    patchUnifiedDiff?: string;
    answerText?: string;
    artifacts?: SubmissionArtifactView[];
    confidence: number;
    contributionRole?: {
      id: string;
      label: string;
      objective?: string;
      workstreamId?: string;
      workstreamLabel?: string;
      workstreamObjective?: string;
    };
  };
  breakdown: {
    finalScore: number;
    buildScore: number;
    testScore: number;
    correctnessRubric: number;
    sideEffectSafety: number;
    explanationScore: number;
    latencyScore: number;
    uniquenessScore: number;
    valid: boolean;
    invalidReasons?: string[];
    summary?: string;
  };
  rank: number;
};

export type RaidRoutingProofResponse = {
  policy: {
    privacyMode: 'off' | 'prefer' | 'strict';
    selectionMode: 'best_match' | 'privacy_first' | 'cost_first' | 'diverse_mix' | 'round_robin';
    requireErc8004: boolean;
    minTrustScore?: number;
    allowedModelFamilies: string[];
    allowedAgentFrameworks?: string[];
    allowedModelProviders?: string[];
    allowedModelIds?: string[];
    requiredPrivacyFeatures: string[];
    venicePrivateLane: boolean;
  };
  providers: Array<{
    providerId: string;
    phase: 'primary' | 'reserve';
    workstreamId?: string;
    workstreamLabel?: string;
    roleId?: string;
    roleLabel?: string;
    modelFamily?: string;
    agentFramework?: string;
    modelProvider?: string;
    modelId?: string;
    verificationStatus?: 'pending' | 'verified' | 'failed' | 'error';
    rateUsd?: number;
    veniceBacked: boolean;
    erc8004Registered: boolean;
    trustScore: number;
    trustReason?: string;
    operatorWallet?: string;
    registrationTx?: string;
    erc8004VerificationStatus?: 'not_checked' | 'verified' | 'partial' | 'failed' | 'error';
    erc8004VerificationCheckedAt?: string;
    agentRegistry?: string;
    agentUri?: string;
    registrationTxFound?: boolean;
    operatorMatchesOwner?: boolean;
    privacyFeatures: string[];
    matchedSpecializations: string[];
    reasons: string[];
  }>;
};

export type RaidSynthesizedOutputResponse = {
  mode: 'multi_agent_synthesis';
  primaryType: string;
  answerText?: string;
  patchUnifiedDiff?: string;
  artifacts?: SubmissionArtifactView[];
  explanation: string;
  baseSubmissionProviderId: string;
  contributingProviderIds: string[];
  supportingProviderIds: string[];
  droppedProviderIds: string[];
  contributions: Array<{
    providerId: string;
    rank: number;
    finalScore: number;
    roleId?: string;
    roleLabel?: string;
    workstreamId?: string;
    workstreamLabel?: string;
  }>;
  workstreams: Array<{
    id: string;
    label: string;
    objective: string;
    primaryType: string;
    baseSubmissionProviderId: string;
    contributingProviderIds: string[];
    supportingProviderIds: string[];
    roleLabels: string[];
    summary: string;
    shortSummary?: string;
    answerText?: string;
    patchUnifiedDiff?: string;
    artifacts?: SubmissionArtifactView[];
  }>;
};

export type SettlementSummaryResponse = {
  successfulProviderCount: number;
  successfulProvidersPaid: number;
  payoutPerSuccessfulProvider: number;
  escrowFundingUsd?: number;
  platformMarkupUsd?: number;
  minimumPayoutThresholdUsd?: number;
  approvedProviderCount?: number;
};

export type SettlementExecutionResponse = {
  mode: 'file' | 'onchain';
  proofStandard: 'erc8183_aligned';
  lifecycleStatus: 'synthetic' | 'partial' | 'terminal';
  executedAt: string;
  artifactPath: string;
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  contracts: {
    registryAddress: string | null;
    escrowAddress: string | null;
    tokenAddress: string | null;
    clientAddress: string | null;
    evaluatorAddress: string | null;
    chainId: string | null;
    rpcUrl?: string | null;
  };
  registryCall: {
    method: 'finalizeRaid';
    args: [string, string];
  };
  childJobs: Array<{
    jobRef: string;
    providerId: string;
    providerAddress?: string | null;
    role: string;
    status: string;
    requestedAction: 'complete' | 'reject';
    lifecycleStatus:
      | 'synthetic'
      | 'open'
      | 'funded'
      | 'submitted'
      | 'completed'
      | 'rejected'
      | 'expired';
    budgetUsd: number;
    budgetAtomic?: string;
    submitResultHash: string | null;
    completionPolicy: string;
    nextAction?: string | null;
    syntheticJobId?: string;
    jobId?: string;
    createTxHash?: string;
    linkTxHash?: string;
    budgetTxHash?: string;
    fundTxHash?: string;
    submitTxHash?: string;
    completeTxHash?: string;
    rejectTxHash?: string;
  }>;
  finalizeTxHash?: string;
  transactionHashes?: string[];
  jobIds?: string[];
  warnings?: string[];
  allocations: Array<{
    providerId: string;
    role: string;
    status: string;
    totalAmount: number;
    deliverableHash?: string;
  }>;
};

export type RaidResultResponse = {
  raidId: string;
  status: string;
  routingProof?: RaidRoutingProofResponse;
  synthesizedOutput?: RaidSynthesizedOutputResponse;
  primarySubmission?: RankedSubmissionResponse;
  approvedSubmissions?: RankedSubmissionResponse[];
  rankedSubmissions?: RankedSubmissionResponse[];
  settlement?: SettlementSummaryResponse;
  settlementExecution?: SettlementExecutionResponse;
  reputationEvents?: Array<{
    providerId: string;
    type: string;
    timestamp: string;
  }>;
};

export type RaidAgentLogResponse = {
  schemaVersion: string;
  generatedAt: string;
  run: {
    raidId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    childRaidCount: number;
    host: 'codex' | 'claude_code' | null;
    receiptPath?: string;
  };
  workstreams: Array<{
    raidId: string;
    workstreamId?: string;
    workstreamLabel?: string;
    workstreamObjective?: string;
    roleId?: string;
    roleLabel?: string;
    roleObjective?: string;
    status: string;
    providers: string[];
    approvedProviders: string[];
  }>;
  decisions: Array<{
    at: string;
    type: string;
    status: 'complete' | 'pending';
    summary: string;
    data?: Record<string, unknown>;
  }>;
  toolCalls: Array<{
    at: string;
    tool: string;
    kind: 'internal' | 'http' | 'evaluation' | 'settlement';
    status: string;
    target?: string;
    details?: Record<string, unknown>;
  }>;
  retries: Array<{
    at: string;
    type: string;
    summary: string;
  }>;
  failures: Array<{
    at: string;
    stage: string;
    providerId?: string;
    summary: string;
  }>;
};

export type AttestedEnvelopeResponse<TPayload> = {
  signer: string;
  message: string;
  messageHash: string;
  signature: string;
  payload: TPayload;
};

export type AttestedRuntimePayloadResponse = {
  version: number;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  storageBackend: string;
  providers: number;
  readyProviders: number;
  raids: number;
  evaluatorTransport: string;
  workerIsolation: string;
};

export type AttestedRaidResultPayloadResponse = {
  version: number;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  evaluatorTransport: string;
  workerIsolation: string;
  raidId: string;
  status: string;
  approvedSubmissionCount: number;
  resultHash: string;
  result: RaidResultResponse;
};

export type RaidSpawnOutputResponse = {
  raidId: string;
  raidAccessToken: string;
  receiptPath: string;
  status: string;
  selectedExperts: number;
  reserveExperts: number;
  estimatedFirstResultSec: number;
  sanitization: {
    riskTier: string;
    redactedSecrets: number;
    redactedIdentifiers: number;
    trimmedFiles: number;
  };
};

export type ChatCompletionResponseView = {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  raid?: {
    raid_id: string;
    raid_access_token: string;
    receipt_path: string;
    agents_invited: number;
    agents_succeeded: number;
    successful_agents: string[];
    synthesized_from_agents?: string[];
    base_agent?: string;
    status?: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type ProviderViewResponse = {
  providerId: string;
  agentId?: string;
  displayName: string;
  description?: string;
  endpointType?: string;
  endpoint?: string;
  specializations: string[];
  supportedLanguages?: string[];
  supportedFrameworks?: string[];
  pricing?: {
    mode?: 'task' | 'token_metered';
    pricePerTaskUsd?: number;
    pricePer1mInputTokensUsd?: number;
    pricePer1mOutputTokensUsd?: number;
    minimumChargeUsd?: number;
    currency?: string;
  };
  maxConcurrency?: number;
  source?: {
    type?: string;
    partyQuestFormationId?: string;
    partyQuestAgentId?: string;
    endpointPath?: string;
  };
  status: string;
  modelFamily?: string;
  agentFramework?: 'codex' | 'claude_code' | 'openclaw' | 'custom';
  modelProvider?: string;
  modelId?: string;
  outputTypes?: string[];
  lastSeenAt?: string;
  verification?: {
    status: 'pending' | 'verified' | 'failed' | 'error';
    checkedAt?: string;
    apiVerified?: boolean;
    frameworkVerified?: boolean;
    modelVerified?: boolean;
    notes?: string[];
  };
  privacy?: {
    score?: number;
    teeAttested?: boolean;
    e2ee?: boolean;
    noDataRetention?: boolean;
    signedOutputs?: boolean;
  };
  erc8004?: {
    agentId: string;
    operatorWallet?: string;
    registrationTx?: string;
    identityRegistry?: string;
    reputationRegistry?: string;
    validationRegistry?: string;
    validationTxs?: string[];
    lastVerifiedAt?: string;
    verification?: {
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
    };
  };
  trust?: {
    score?: number;
    reason?: string;
    source?: 'erc8004';
  };
  scores?: {
    privacyScore: number;
    reputationScore: number;
  };
  pricePerTaskUsd: number;
  marketplaceOfferStatus?: 'active' | 'paused';
  reputation: {
    globalScore: number;
    responsivenessScore: number;
    validityScore: number;
    qualityScore: number;
    timeoutRate: number;
    totalSuccessfulRaids: number;
  };
};

export type ProviderHealthViewResponse = {
  providerId: string;
  providerName?: string;
  endpoint?: string;
  reachable: boolean;
  ready: boolean;
  statusCode?: number;
  missing?: string[];
  agentFramework?: 'codex' | 'claude_code' | 'openclaw' | 'custom';
  modelProvider?: string;
  model?: string | null;
  modelApiBase?: string;
  error?: string;
};

export type OpsSessionStatusResponse = {
  authenticated: boolean;
  expiresAt?: string;
};

export type OpsX402SettingsResponse = {
  enabled: boolean;
  envDefault: string | null;
  network: string;
  asset: string;
  payToConfigured: boolean;
  facilitatorConfigured: boolean;
  canEnable: boolean;
  payTo: string | null;
};

export type OpsSettingsResponse = {
  x402: OpsX402SettingsResponse;
};

export type BuyerApiKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
};

export type PublicSessionView = {
  authenticated: boolean;
  wallet?: string;
  account?: {
    wallet: string;
    createdAt: string;
    balanceUsd?: number;
    sellerProviderIds: string[];
    apiKeys: BuyerApiKeyView[];
    totalSavingsUsd?: number;
  };
};

export type AuthNonceResponseView = {
  wallet: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type ApiKeyCreateResponseView = {
  apiKey: string;
  key: BuyerApiKeyView;
};

export type SellerProviderCreateResponseView = {
  provider: ProviderViewResponse;
  health: ProviderHealthViewResponse;
};

export type SellerEarningsView = {
  grossUsd: number;
  payoutCount: number;
  payouts: Array<{
    raidId: string;
    providerId: string;
    amountUsd: number;
    status: string;
    settledAt?: string;
  }>;
};

export type InferenceMarketSellerView = {
  sellerId: string;
  displayName: string;
  modelProvider?: string;
  agentFramework?: ProviderViewResponse['agentFramework'];
  rateUsd: number;
  status: string;
  marketplaceOfferStatus?: 'active' | 'paused';
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'error';
  privacy: {
    teeAttested?: boolean;
    e2ee?: boolean;
    signedOutputs?: boolean;
    noDataRetention?: boolean;
  };
  outputTypes?: string[];
  maxConcurrency: number;
  pricing: {
    unit: 'task' | 'token_metered';
    pricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    minimumChargeUsd: number | null;
    currency: string;
    upstreamModelId?: string;
    maxContextTokens?: number;
  };
};

export type InferenceMarketView = {
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
    benchmarkUrl: string;
    benchmarkMode: 'static_reference_only';
    declaredUnit: 'task' | 'token_metered';
    cheapestPricePerTaskUsd: number | null;
    pricePer1mInputTokensUsd: number | null;
    pricePer1mOutputTokensUsd: number | null;
    referenceInputTokens: number | null;
    referenceOutputTokens: number | null;
  };
  sellers: InferenceMarketSellerView[];
};

export type MarketplaceStatsView = {
  activeOffers: number;
  modelsLive: number;
  routedRequests24h: number;
  earnedBySellers24hUsd: number;
};

export type MarketsResponseView = {
  object: 'list';
  stats: MarketplaceStatsView;
  settlement: {
    asset: string;
    network: string;
    rule: string;
  };
  custody: {
    sellerCredentialPolicy: string;
    privacyPolicy: string;
  };
  data: InferenceMarketView[];
};

export type OpenAiModelEntryView = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  bossraid?: {
    cheapest_rate_usd?: number | null;
    active_seller_count?: number;
    verified_seller_count?: number;
    model_provider?: string;
  };
};

export type ModelsResponseView = {
  object: 'list';
  data: OpenAiModelEntryView[];
};

export type BuyerPurchaseView = {
  id: string;
  wallet: string;
  apiKeyId?: string;
  raidId: string;
  modelId?: string;
  sellerId?: string;
  costUsd: number;
  benchmarkPriceUsd?: number;
  savingsUsd?: number;
  route: 'raid' | 'chat' | 'inference';
  createdAt: string;
};

export type BuyerPurchasesResponseView = {
  object: 'list';
  totalSpentUsd: number;
  totalSavingsUsd: number;
  data: BuyerPurchaseView[];
};

export type SellerStatsView = {
  grossUsd: number;
  payoutCount: number;
  earnings24hUsd: number;
  routedRequests24h: number;
  activeOffers: number;
  pausedOffers: number;
  providers: Array<{
    providerId: string;
    displayName: string;
    modelId?: string;
    marketplaceOfferStatus: 'active' | 'paused';
    verificationStatus?: string;
  }>;
};
