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
    invalidReasons: string[];
    summary?: string;
  };
  rank: number;
};

export type RaidResult = {
  raidId: string;
  status: string;
  routingProof?: {
    policy: {
      privacyMode: "off" | "prefer" | "strict";
      selectionMode: "best_match" | "privacy_first" | "cost_first" | "diverse_mix";
      requireErc8004: boolean;
      minTrustScore?: number;
      allowedModelFamilies: string[];
      requiredPrivacyFeatures: string[];
      venicePrivateLane: boolean;
    };
    providers: Array<{
      providerId: string;
      phase: "primary" | "reserve";
      workstreamId?: string;
      workstreamLabel?: string;
      roleId?: string;
      roleLabel?: string;
      modelFamily?: string;
      veniceBacked: boolean;
      erc8004Registered: boolean;
      trustScore: number;
      trustReason?: string;
      operatorWallet?: string;
      registrationTx?: string;
      erc8004VerificationStatus?: "not_checked" | "verified" | "partial" | "failed" | "error";
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
    mode: "multi_agent_synthesis";
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
  rankedSubmissions?: RankedSubmission[];
  settlement?: {
    successfulProviderCount: number;
    successfulProvidersPaid: number;
    payoutPerSuccessfulProvider: number;
  };
  settlementExecution?: {
    mode: "file" | "onchain";
    proofStandard: "erc8183_aligned";
    lifecycleStatus: "synthetic" | "partial" | "terminal";
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
      method: "finalizeRaid";
      args: [string, string];
    };
    childJobs: Array<{
      jobRef: string;
      providerId: string;
      providerAddress?: string | null;
      role: string;
      status: string;
      requestedAction: "complete" | "reject";
      lifecycleStatus: "synthetic" | "open" | "funded" | "submitted" | "completed" | "rejected" | "expired";
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

export type Provider = {
  providerId: string;
  agentId?: string;
  displayName: string;
  description?: string;
  specializations: string[];
  status: string;
  modelFamily?: string;
  outputTypes?: string[];
  lastSeenAt?: string;
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
      status: "not_checked" | "verified" | "partial" | "failed" | "error";
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
    source?: "erc8004";
  };
  scores?: {
    privacyScore: number;
    reputationScore: number;
  };
  pricePerTaskUsd: number;
  reputation: {
    globalScore: number;
    responsivenessScore: number;
    validityScore: number;
    qualityScore: number;
    timeoutRate: number;
    totalSuccessfulRaids: number;
  };
};

export type ProviderHealth = {
  providerId: string;
  providerName?: string;
  endpoint?: string;
  reachable: boolean;
  ready: boolean;
  statusCode?: number;
  missing?: string[];
  model?: string | null;
  modelApiBase?: string;
  error?: string;
};

export const API_BASE =
  (import.meta.env.VITE_BOSSRAID_OPS_API_BASE as string | undefined) ?? "/ops-api";

export type OpsSessionStatus = {
  authenticated: boolean;
  expiresAt?: string;
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...init,
  });
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (typeof payload.message === "string" && payload.message.length > 0) {
        message = payload.message;
      } else if (typeof payload.error === "string" && payload.error.length > 0) {
        message = payload.error;
      }
    } catch {
      // Ignore parse errors and keep the status-based message.
    }

    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchOpsSessionStatus(): Promise<OpsSessionStatus> {
  const response = await apiFetch("/v1/ops/session");
  if (response.status === 401) {
    return { authenticated: false };
  }
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (typeof payload.message === "string" && payload.message.length > 0) {
        message = payload.message;
      } else if (typeof payload.error === "string" && payload.error.length > 0) {
        message = payload.error;
      }
    } catch {
      // Ignore parse errors and keep the status-based message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<OpsSessionStatus>;
}

export async function createOpsSession(token: string): Promise<OpsSessionStatus> {
  return fetchJson<OpsSessionStatus>("/v1/ops/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
}

export async function deleteOpsSession(): Promise<OpsSessionStatus> {
  return fetchJson<OpsSessionStatus>("/v1/ops/session", {
    method: "DELETE",
  });
}
