export type SupportedLanguage = "csharp" | "typescript" | "python" | "solidity" | "text";
export type SupportedFramework =
  | "unity"
  | "node"
  | "react"
  | "foundry"
  | "django"
  | "fastapi";
export type OutputType = "text" | "json" | "image" | "video" | "patch" | "bundle";
export type PrivacyRoutingMode = "off" | "prefer" | "strict";
export type SelectionMode = "best_match" | "privacy_first" | "cost_first" | "diverse_mix";
export type PrivacyFeatureKey =
  | "tee_attested"
  | "e2ee"
  | "no_data_retention"
  | "signed_outputs"
  | "provenance_attested"
  | "operator_verified";

export type RaidStatus =
  | "draft"
  | "sanitizing"
  | "queued"
  | "dispatching"
  | "running"
  | "first_valid"
  | "evaluating"
  | "settling"
  | "final"
  | "cancelled"
  | "expired";

export type AssignmentStatus =
  | "selected"
  | "invited"
  | "accepted"
  | "running"
  | "submitted"
  | "invalid"
  | "timed_out"
  | "failed"
  | "disqualified"
  | "paid";

export type ProviderStatus = "available" | "degraded" | "offline";
export type SubmissionFormat =
  | "unified_diff_plus_explanation"
  | "text_answer_plus_explanation"
  | "artifact_plus_explanation";

export type ReputationEventType =
  | "invite_timeout"
  | "heartbeat_timeout"
  | "valid_submission"
  | "successful_provider"
  | "invalid_submission"
  | "duplicate_submission"
  | "security_violation";

export interface TaskFile {
  path: string;
  content: string;
  sha256: string;
}

export interface FailingSignals {
  errors: string[];
  tests?: string[];
  reproSteps?: string[];
  expectedBehavior?: string;
  observedBehavior?: string;
}

export interface RaidConstraints {
  numExperts: number;
  maxBudgetUsd: number;
  maxLatencySec: number;
  allowExternalSearch: boolean;
  requireSpecializations: string[];
  minReputation: number;
  requireErc8004?: boolean;
  minTrustScore?: number;
  maxChangedFiles?: number;
  maxDiffLines?: number;
  forbidPaths?: string[];
  allowedModelFamilies?: string[];
  allowedOutputTypes?: OutputType[];
  privacyMode?: PrivacyRoutingMode;
  requirePrivacyFeatures?: PrivacyFeatureKey[];
  selectionMode?: SelectionMode;
}

export interface RewardPolicy {
  splitStrategy: "equal_success_only";
}

export interface PrivacyMode {
  redactSecrets: boolean;
  redactIdentifiers: boolean;
  allowFullRepo: boolean;
}

export interface HostContext {
  host: "codex" | "claude_code";
  sessionId?: string;
  repoRootHint?: string;
  branchName?: string;
}

export interface RaidTaskSpec {
  taskTitle: string;
  taskDescription: string;
  language: SupportedLanguage;
  framework?: SupportedFramework | string;
  files: TaskFile[];
  failingSignals: FailingSignals;
  output?: {
    primaryType: OutputType;
    artifactTypes?: OutputType[];
  };
  constraints: RaidConstraints;
  rewardPolicy: RewardPolicy;
  privacyMode: PrivacyMode;
  hostContext?: HostContext;
}

export interface SanitizationIssue {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
}

export interface SanitizationReport {
  redactedSecrets: number;
  redactedIdentifiers: number;
  removedUrls: number;
  trimmedFiles: number;
  unsafeContentDetected: boolean;
  riskTier: "safe" | "medium" | "unsafe";
  issues: SanitizationIssue[];
}

export interface SanitizedTaskSpec extends RaidTaskSpec {
  originalFileCount: number;
  originalBytes: number;
  sanitizationReport: SanitizationReport;
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
}

export interface ProviderTrust {
  score?: number;
  reason?: string;
  source?: "erc8004";
}

export interface ProviderProfile {
  providerId: string;
  agentId?: string;
  displayName: string;
  description?: string;
  endpointType: "http";
  endpoint: string;
  specializations: string[];
  supportedLanguages: SupportedLanguage[];
  supportedFrameworks: string[];
  pricePerTaskUsd: number;
  maxConcurrency: number;
  status: ProviderStatus;
  modelFamily?: string;
  outputTypes?: OutputType[];
  privacy?: ProviderPrivacy;
  erc8004?: Erc8004Identity;
  trust?: ProviderTrust;
  reputation: ProviderReputation;
  scores?: ProviderScores;
  lastSeenAt?: string;
  auth?: ProviderAuthConfig;
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
  privacy?: ProviderPrivacy;
  erc8004?: Partial<Erc8004Identity>;
  trust?: Partial<ProviderTrust>;
  pricing?: {
    pricePerTaskUsd?: number;
  };
  auth?: ProviderAuthConfig;
  reputation?: Partial<ProviderReputation>;
}

export interface AgentHeartbeatInput {
  agentId: string;
  status?: ProviderStatus;
  timestamp?: string;
}

export interface ProviderAuthConfig {
  type: "bearer" | "hmac" | "none";
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
  model?: string | null;
  modelApiBase?: string;
  error?: string;
}

export interface SubmissionArtifact {
  outputType: OutputType;
  label: string;
  uri: string;
  mimeType?: string;
  description?: string;
  sha256?: string;
}

export interface ProviderSubmission {
  raidId: string;
  providerId: string;
  providerRunId?: string;
  patchUnifiedDiff?: string;
  answerText?: string;
  artifacts?: SubmissionArtifact[];
  explanation: string;
  confidence: number;
  claimedRootCause?: string;
  contributionRole?: {
    id: string;
    label: string;
    objective?: string;
    workstreamId?: string;
    workstreamLabel?: string;
    workstreamObjective?: string;
  };
  filesTouched: string[];
  submittedAt: string;
}

export interface RaidContributionPlan {
  providerIndex: number;
  totalExperts: number;
  roleId: string;
  roleLabel: string;
  roleObjective: string;
  workstreamId: string;
  workstreamLabel: string;
  workstreamObjective: string;
  prompt: string;
}

export interface BossRaidRoutingPolicy {
  privacyMode: PrivacyRoutingMode;
  selectionMode: SelectionMode;
  requireErc8004: boolean;
  minTrustScore?: number;
  allowedModelFamilies: string[];
  requiredPrivacyFeatures: PrivacyFeatureKey[];
  venicePrivateLane: boolean;
}

export interface BossRaidRoutingDecision {
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
  erc8004VerificationStatus?: Erc8004Verification["status"];
  erc8004VerificationCheckedAt?: string;
  agentRegistry?: string;
  agentUri?: string;
  registrationTxFound?: boolean;
  operatorMatchesOwner?: boolean;
  privacyFeatures: PrivacyFeatureKey[];
  matchedSpecializations: string[];
  reasons: string[];
}

export interface BossRaidRoutingProof {
  policy: BossRaidRoutingPolicy;
  providers: BossRaidRoutingDecision[];
}

export interface ProviderTaskPackage {
  raidId: string;
  submissionFormat: SubmissionFormat;
  desiredOutput: {
    primaryType: OutputType;
    artifactTypes: OutputType[];
  };
  task: {
    title: string;
    description: string;
    language: SupportedLanguage;
    framework?: string;
  };
  artifacts: {
    files: TaskFile[];
    errors: string[];
    reproSteps: string[];
    tests: string[];
    expectedBehavior?: string;
    observedBehavior?: string;
  };
  constraints: {
    maxChangedFiles: number;
    maxDiffLines: number;
    forbidPaths: string[];
    mustNot: string[];
  };
  synthesis?: {
    mode: "multi_agent_synthesis";
    role: "contributor";
    totalExperts: number;
    providerIndex: number;
    workstreamId: string;
    workstreamLabel: string;
    workstreamObjective: string;
    roleId: string;
    roleLabel: string;
    roleObjective: string;
    focus: string;
    guidance: string[];
  };
  deadlineUnix: number;
}

export interface ProviderAcceptance {
  accepted: boolean;
  providerRunId: string;
}

export interface ProviderHeartbeat {
  raidId: string;
  providerId: string;
  providerRunId: string;
  progress: number;
  message?: string;
  timestamp: string;
}

export interface ProviderFailure {
  raidId: string;
  providerId: string;
  providerRunId?: string;
  message: string;
  failedAt: string;
}

export interface BuildCheckResult {
  passed: boolean;
  score: number;
  summary: string;
}

export interface TestCheckResult {
  passed: number;
  failed: number;
  score: number;
  summary: string;
}

export interface RuntimeProbeInput {
  task: SanitizedTaskSpec;
  files: TaskFile[];
  touchedFiles: string[];
}

export interface RuntimeProbeResult {
  build: BuildCheckResult;
  tests: TestCheckResult;
}

export interface HeuristicResult {
  score: number;
  diffLines: number;
  touchedFiles: number;
  dangerousPathsTouched: boolean;
  duplicateOfProviderId?: string;
  issues: string[];
}

export interface LlmRubricResult {
  correctness: number;
  sideEffectSafety: number;
  explanation: number;
  rationale: string;
}

export interface EvaluationBreakdown {
  schemaPass: boolean;
  patchApplyPass: boolean;
  buildScore: number;
  testScore: number;
  heuristicScore: number;
  correctnessRubric: number;
  sideEffectSafety: number;
  explanationScore: number;
  latencyScore: number;
  uniquenessScore: number;
  finalScore: number;
  valid: boolean;
  invalidReasons: string[];
  summary?: string;
}

export interface RankedSubmission {
  submission: ProviderSubmission;
  breakdown: EvaluationBreakdown;
  rank: number;
}

export interface ReputationDelta {
  global?: number;
  responsiveness?: number;
  validity?: number;
  quality?: number;
}

export interface ReputationEvent {
  providerId: string;
  type: ReputationEventType;
  delta: ReputationDelta;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface AssignmentRecord {
  providerId: string;
  status: AssignmentStatus;
  contributionRole?: {
    id: string;
    label: string;
    objective?: string;
    workstreamId?: string;
    workstreamLabel?: string;
    workstreamObjective?: string;
  };
  invitedAt?: string;
  acceptedAt?: string;
  firstHeartbeatAt?: string;
  lastHeartbeatAt?: string;
  submittedAt?: string;
  timeoutAt?: string;
  latencyMs?: number;
  progress?: number;
  providerRunId?: string;
  message?: string;
}

export interface RaidAdaptiveReplanEvent {
  targetRaidId: string;
  targetParentRaidId: string;
  workstreamId: string;
  workstreamLabel: string;
  strategy: "expand" | "repair";
  reason: string;
  spawnedRaidIds: string[];
  createdAt: string;
}

export interface RaidAdaptivePlanningState {
  availableProviderIds: string[];
  plannedReserveExperts: number;
  revisionCount: number;
  maxRevisions: number;
  spawnedChildRaidIds: string[];
  history: RaidAdaptiveReplanEvent[];
}

export interface BossRaidAdaptivePlanningOutput {
  plannedReserveExperts: number;
  remainingReserveExperts: number;
  revisionCount: number;
  maxRevisions: number;
  history: RaidAdaptiveReplanEvent[];
}

export interface RaidRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RaidStatus;
  deadlineUnix: number;
  raidAccessTokenHash?: string;
  planningMode?: "single_raid" | "hierarchical_parent" | "hierarchical_child";
  parentRaidId?: string;
  childRaidIds?: string[];
  contributionPlan?: RaidContributionPlan;
  adaptivePlanning?: RaidAdaptivePlanningState;
  task: SanitizedTaskSpec;
  selectedProviders: string[];
  reserveProviders: string[];
  routingProof?: BossRaidRoutingProof;
  assignments: Record<string, AssignmentRecord>;
  rankedSubmissions: RankedSubmission[];
  firstValidSubmissionId?: string;
  primarySubmissionId?: string;
  synthesizedOutput?: BossRaidSynthesizedOutput;
  bestCurrentScore?: number;
  settlementExecution?: SettlementExecutionRecord;
  reputationEvents: ReputationEvent[];
}

export interface SelectedProviders {
  primaries: ProviderProfile[];
  reserves: ProviderProfile[];
}

export interface BossRaidSpawnInput extends RaidTaskSpec {}

export interface BossRaidRequest {
  agent: "mercenary-v1";
  taskType: string;
  task: {
    title: string;
    description: string;
    language: SupportedLanguage;
    framework?: string;
    files: TaskFile[];
    failingSignals?: FailingSignals;
  };
  output?: {
    primaryType: OutputType;
    artifactTypes?: OutputType[];
  };
  raidPolicy?: {
    maxAgents?: number;
    maxLatencySec?: number;
    requiredCapabilities?: string[];
    allowedModelFamilies?: string[];
    minReputationScore?: number;
    requireErc8004?: boolean;
    minTrustScore?: number;
    privacyMode?: PrivacyRoutingMode;
    requirePrivacyFeatures?: PrivacyFeatureKey[];
    allowedOutputTypes?: OutputType[];
    maxTotalCost?: number | string;
    selectionMode?: SelectionMode;
  };
  hostContext?: HostContext;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  user?: string;
  raidRequest?: BossRaidSpawnInput;
  raidPolicy?: BossRaidRequest["raidPolicy"];
}

export interface ProviderDiscoveryQuery {
  capabilities?: string[];
  allowedModelFamilies?: string[];
  allowedOutputTypes?: OutputType[];
  privacyMode?: PrivacyRoutingMode;
  requirePrivacyFeatures?: PrivacyFeatureKey[];
  requireErc8004?: boolean;
  minTrustScore?: number;
  minReputationScore?: number;
  onlineOnly?: boolean;
  maxHeartbeatAgeMs?: number;
}

export interface BossRaidSpawnOutput {
  raidId: string;
  raidAccessToken: string;
  receiptPath: string;
  status: RaidStatus;
  selectedExperts: number;
  reserveExperts: number;
  estimatedFirstResultSec: number;
  sanitization: SanitizationReport;
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
  route: "raid" | "chat";
  requestKey: string;
  createdAt: string;
  expiresAt: string;
  paymentTimeoutSeconds?: number;
  deadlineUnix: number;
  mode: "single" | "hierarchical";
  sanitized: SanitizedTaskSpec;
  selectedProviders?: ReservedSelectedProviders;
  graph?: ReservedRaidNode;
  adaptiveProviderIds?: string[];
  reservedProviderIds: string[];
  spawnOutput?: BossRaidSpawnOutput;
}

export interface BossRaidStatusOutput {
  raidId: string;
  status: RaidStatus;
  experts: Array<{
    providerId: string;
    status: AssignmentStatus;
    latencyMs?: number;
    heartbeatAgeMs?: number;
    progress?: number;
    message?: string;
  }>;
  firstValidAvailable: boolean;
  bestCurrentScore?: number;
  adaptivePlanning?: BossRaidAdaptivePlanningOutput;
  sanitization: SanitizationReport;
}

export interface SettlementSummary {
  successfulProviderCount: number;
  successfulProvidersPaid: number;
  payoutPerSuccessfulProvider: number;
}

export interface SettlementAllocation {
  providerId: string;
  role: "successful" | "unsuccessful";
  status: "complete" | "reject";
  totalAmount: number;
  deliverableHash?: string;
}

export interface SettlementContractsProof {
  registryAddress: string | null;
  escrowAddress: string | null;
  tokenAddress: string | null;
  clientAddress: string | null;
  evaluatorAddress: string | null;
  chainId: string | null;
  rpcUrl?: string | null;
}

export interface SettlementRegistryCallProof {
  method: "finalizeRaid";
  args: [string, string];
}

export interface SettlementChildJobProof {
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
}

export interface SettlementExecutionRecord {
  mode: "file" | "onchain";
  proofStandard: "erc8183_aligned";
  lifecycleStatus: "synthetic" | "partial" | "terminal";
  executedAt: string;
  artifactPath: string;
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  allocations: SettlementAllocation[];
  contracts: SettlementContractsProof;
  registryCall: SettlementRegistryCallProof;
  childJobs: SettlementChildJobProof[];
  finalizeTxHash?: string;
  transactionHashes?: string[];
  jobIds?: string[];
  warnings?: string[];
}

export interface BossRaidSynthesizedOutputContribution {
  providerId: string;
  rank: number;
  finalScore: number;
  roleId?: string;
  roleLabel?: string;
  workstreamId?: string;
  workstreamLabel?: string;
}

export interface BossRaidSynthesizedWorkstream {
  id: string;
  label: string;
  objective: string;
  primaryType: OutputType;
  baseSubmissionProviderId: string;
  contributingProviderIds: string[];
  supportingProviderIds: string[];
  roleLabels: string[];
  summary: string;
  shortSummary?: string;
  answerText?: string;
  patchUnifiedDiff?: string;
  artifacts?: SubmissionArtifact[];
}

export interface BossRaidSynthesizedOutput {
  mode: "multi_agent_synthesis";
  primaryType: OutputType;
  answerText?: string;
  patchUnifiedDiff?: string;
  artifacts?: SubmissionArtifact[];
  explanation: string;
  baseSubmissionProviderId: string;
  contributingProviderIds: string[];
  supportingProviderIds: string[];
  droppedProviderIds: string[];
  contributions: BossRaidSynthesizedOutputContribution[];
  workstreams: BossRaidSynthesizedWorkstream[];
}

export interface BossRaidResultOutput {
  raidId: string;
  status: RaidStatus;
  synthesizedOutput?: BossRaidSynthesizedOutput;
  adaptivePlanning?: BossRaidAdaptivePlanningOutput;
  routingProof?: BossRaidRoutingProof;
  primarySubmission?: RankedSubmission;
  approvedSubmissions?: RankedSubmission[];
  rankedSubmissions?: RankedSubmission[];
  settlement?: SettlementSummary;
  settlementExecution?: SettlementExecutionRecord;
  reputationEvents?: ReputationEvent[];
}

export interface RewardComputation {
  successfulProviderCount: number;
  payoutPerSuccessfulProvider: number;
  successfulProvidersPaid: number;
}

export interface BossRaidReplayOutput {
  raidId: string;
  reEvaluated: number;
}

export interface BossRaidPersistenceSnapshot {
  version: 1;
  savedAt: string;
  raids: RaidRecord[];
  providers: ProviderProfile[];
  launchReservations?: RaidLaunchReservationRecord[];
}
