import {
  fetchJson,
  requestJsonDetailed,
  RAID_ACCESS_TOKEN_HEADER,
  type ApiResponse,
} from './client.js';

export type RaidListItem = {
  raidId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  bestCurrentScore?: number;
  firstValidSubmissionId?: number | string;
  primarySubmissionId?: string;
  successfulSubmissionCount?: number;
};

export type RaidStatus = {
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

export type RankedSubmission = {
  submission: {
    providerId: string;
    explanation: string;
    patchUnifiedDiff?: string;
    answerText?: string;
    artifacts?: Array<{
      outputType: string;
      label: string;
      uri: string;
      mimeType?: string;
      description?: string;
      sha256?: string;
    }>;
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
    summary?: string;
  };
  rank: number;
};

export type RaidResult = {
  raidId: string;
  status: string;
  routingProof?: {
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
  synthesizedOutput?: {
    mode: 'multi_agent_synthesis';
    primaryType: string;
    answerText?: string;
    patchUnifiedDiff?: string;
    artifacts?: Array<{
      outputType: string;
      label: string;
      uri: string;
      mimeType?: string;
      description?: string;
      sha256?: string;
    }>;
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
      artifacts?: Array<{
        outputType: string;
        label: string;
        uri: string;
        mimeType?: string;
        description?: string;
        sha256?: string;
      }>;
    }>;
  };
  primarySubmission?: RankedSubmission;
  approvedSubmissions?: RankedSubmission[];
  settlement?: {
    successfulProviderCount: number;
    successfulProvidersPaid: number;
    payoutPerSuccessfulProvider: number;
  };
  settlementExecution?: {
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
  reputationEvents?: Array<{
    providerId: string;
    type: string;
    timestamp: string;
  }>;
};

export type RaidAgentLog = {
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

export type AttestedEnvelope<TPayload> = {
  signer: string;
  message: string;
  messageHash: string;
  signature: string;
  payload: TPayload;
};

export type AttestedRuntimePayload = {
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

export type AttestedRaidResultPayload = {
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
  result: RaidResult;
};

export type RaidSpawnOutput = {
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

export type ChatCompletionResponse = {
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

export async function spawnDemoRaid(payload: unknown): Promise<ApiResponse<RaidSpawnOutput>> {
  return requestJsonDetailed<RaidSpawnOutput>('/v1/demo/raid', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function requestChatCompletion(
  payload: unknown
): Promise<ApiResponse<ChatCompletionResponse>> {
  return requestJsonDetailed<ChatCompletionResponse>('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function raidTokenHeaders(raidAccessToken: string): Record<string, string> {
  return {
    [RAID_ACCESS_TOKEN_HEADER]: raidAccessToken,
  };
}

export async function fetchRaidStatus(
  raidId: string,
  raidAccessToken: string
): Promise<RaidStatus> {
  return fetchJson<RaidStatus>(`/v1/raids/${encodeURIComponent(raidId)}`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}

export async function fetchRaidResult(
  raidId: string,
  raidAccessToken: string
): Promise<RaidResult> {
  return fetchJson<RaidResult>(`/v1/raids/${encodeURIComponent(raidId)}/result`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}

export async function fetchRaidAgentLog(
  raidId: string,
  raidAccessToken: string
): Promise<RaidAgentLog> {
  return fetchJson<RaidAgentLog>(
    `/v1/raids/${encodeURIComponent(raidId)}/agent_log.json?token=${encodeURIComponent(raidAccessToken)}`
  );
}

export async function fetchAttestedRuntime(): Promise<AttestedEnvelope<AttestedRuntimePayload>> {
  return fetchJson<AttestedEnvelope<AttestedRuntimePayload>>('/v1/attested-runtime');
}

export async function fetchAttestedRaidResult(
  raidId: string,
  raidAccessToken: string
): Promise<AttestedEnvelope<AttestedRaidResultPayload>> {
  return fetchJson<AttestedEnvelope<AttestedRaidResultPayload>>(
    `/v1/raid/${encodeURIComponent(raidId)}/attested-result`,
    {
      headers: raidTokenHeaders(raidAccessToken),
    }
  );
}
