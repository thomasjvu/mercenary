import type { PrivacyAttestationView } from './privacy.js';
import type { SettlementExecutionResponse, SettlementSummaryResponse } from './settlement.js';

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
    privacyAttestation?: PrivacyAttestationView;
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
