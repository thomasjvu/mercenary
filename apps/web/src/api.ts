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
  settlement?: {
    successfulProviderCount: number;
    successfulProvidersPaid: number;
    payoutPerSuccessfulProvider: number;
  };
  settlementExecution?: {
    mode: "file" | "onchain";
    proofStandard: "erc8183_aligned";
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
      budgetUsd: number;
      budgetAtomic?: string;
      submitResultHash: string | null;
      completionPolicy: string;
      syntheticJobId?: string;
      jobId?: string;
      createTxHash?: string;
      linkTxHash?: string;
      budgetTxHash?: string;
      fundTxHash?: string;
    }>;
    transactionHashes?: string[];
    jobIds?: string[];
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

export type ApiResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  headers: Record<string, string>;
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

export const API_BASE =
  (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ?? "/api";
export const RAID_ACCESS_TOKEN_HEADER = "x-bossraid-raid-token";

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
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

export async function requestJsonDetailed<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const headers = Object.fromEntries(response.headers.entries());
  const text = await response.text();

  let data: T | undefined;
  let error: string | undefined;

  if (text.length > 0) {
    try {
      const parsed = JSON.parse(text) as T | { message?: string; error?: string };
      if (response.ok) {
        data = parsed as T;
      } else {
        error =
          typeof (parsed as { message?: string }).message === "string"
            ? (parsed as { message?: string }).message
            : typeof (parsed as { error?: string }).error === "string"
              ? (parsed as { error?: string }).error
              : undefined;
        data = parsed as T;
      }
    } catch {
      if (!response.ok) {
        error = text;
      }
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: error ?? (response.ok ? undefined : `Request failed: ${response.status}`),
    headers,
  };
}

export async function spawnRaid(payload: unknown): Promise<ApiResponse<RaidSpawnOutput>> {
  return requestJsonDetailed<RaidSpawnOutput>("/v1/raid", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function raidTokenHeaders(raidAccessToken: string): Record<string, string> {
  return {
    [RAID_ACCESS_TOKEN_HEADER]: raidAccessToken,
  };
}

export async function fetchRaidStatus(raidId: string, raidAccessToken: string): Promise<RaidStatus> {
  return fetchJson<RaidStatus>(`/v1/raids/${encodeURIComponent(raidId)}`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}

export async function fetchRaidResult(raidId: string, raidAccessToken: string): Promise<RaidResult> {
  return fetchJson<RaidResult>(`/v1/raids/${encodeURIComponent(raidId)}/result`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}
