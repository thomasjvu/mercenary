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
  agentFramework?: 'codex' | 'claude_code' | 'openclaw' | 'grok' | 'glm' | 'chutes' | 'custom';
  modelProvider?: string;
  modelId?: string;
  outputTypes?: string[];
  harnessProfile?: {
    lane: 'api_chat' | 'agent_harness';
    installation: 'fresh' | 'skill_augmented' | 'unknown';
    skills: Array<{ id: string; name?: string; version?: string; contentHash?: string }>;
    imageDigest?: string;
    compositionHash?: string;
    framework?: string;
    planProvider?: string;
    attestedAt?: string;
    verification?: 'unverified' | 'heartbeat_self_report' | 'image_attested';
  };
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
  agentFramework?: 'codex' | 'claude_code' | 'openclaw' | 'grok' | 'glm' | 'chutes' | 'custom';
  modelProvider?: string;
  model?: string | null;
  modelApiBase?: string;
  harnessProfile?: ProviderViewResponse['harnessProfile'];
  error?: string;
};
