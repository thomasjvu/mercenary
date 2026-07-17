import type { RaidLaunchReservationRecord } from './marketplace.js';
import type {
  AgentFramework,
  Erc8004Verification,
  OutputType,
  PrivacyAttestation,
  HarnessInstallation,
  PrivacyFeatureKey,
  PrivacyRoutingMode,
  ProviderPricing,
  ProviderProfile,
  ProviderVerificationStatus,
  SelectionMode,
  SupportedFramework,
  SupportedLanguage,
} from './provider.js';
import type {
  DelegationChainEntry,
  RaidDelegationRecord,
  RaidPaymentProof,
  VeniceDirectCallRecord,
} from './delegation.js';
import type { SettlementExecutionRecord, SettlementSummary } from './settlement.js';

export type RaidStatus =
  | 'draft'
  | 'sanitizing'
  | 'queued'
  | 'dispatching'
  | 'running'
  | 'first_valid'
  | 'evaluating'
  | 'settling'
  | 'final'
  | 'cancelled'
  | 'expired';

export type AssignmentStatus =
  | 'selected'
  | 'invited'
  | 'accepted'
  | 'running'
  | 'submitted'
  | 'invalid'
  | 'timed_out'
  | 'failed'
  | 'disqualified'
  | 'paid';

export type SubmissionFormat =
  | 'unified_diff_plus_explanation'
  | 'text_answer_plus_explanation'
  | 'artifact_plus_explanation'
  | 'party_quest_provider_v1';

export type ReputationEventType =
  | 'invite_timeout'
  | 'heartbeat_timeout'
  | 'valid_submission'
  | 'successful_provider'
  | 'invalid_submission'
  | 'duplicate_submission'
  | 'security_violation';

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
  requiredVerificationStatus?: ProviderVerificationStatus;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxChangedFiles?: number;
  maxDiffLines?: number;
  forbidPaths?: string[];
  allowedModelFamilies?: string[];
  allowedAgentFrameworks?: AgentFramework[];
  requiredProviderIds?: string[];
  allowedModelProviders?: string[];
  allowedModelIds?: string[];
  allowedOutputTypes?: OutputType[];
  privacyMode?: PrivacyRoutingMode;
  requirePrivacyFeatures?: PrivacyFeatureKey[];
  selectionMode?: SelectionMode;
  minimumPayoutThresholdUsd?: number;
  /** Prefer pure installs (`fresh`) or allow skill-augmented harnesses. */
  allowedInstallations?: HarnessInstallation[];
  /** Require every listed skill id on the provider harness profile. */
  requiredSkills?: string[];
  /** Seller-declared credential class filter (`api_key` | `plan_or_cli` | `unknown`). */
  allowedCredentialClasses?: Array<'api_key' | 'plan_or_cli' | 'unknown'>;
}

export interface RewardPolicy {
  splitStrategy: 'equal_success_only';
}

export interface PrivacyMode {
  redactSecrets: boolean;
  redactIdentifiers: boolean;
  allowFullRepo: boolean;
}

export interface HostContext {
  host: 'codex' | 'claude_code' | 'party-quest';
  sessionId?: string;
  repoRootHint?: string;
  branchName?: string;
  delegationChain?: DelegationChainEntry[];
  sessionAccount?: string;
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
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface SanitizationReport {
  redactedSecrets: number;
  redactedIdentifiers: number;
  removedUrls: number;
  trimmedFiles: number;
  unsafeContentDetected: boolean;
  riskTier: 'safe' | 'medium' | 'unsafe';
  issues: SanitizationIssue[];
}

export interface SanitizedTaskSpec extends RaidTaskSpec {
  originalFileCount: number;
  originalBytes: number;
  sanitizationReport: SanitizationReport;
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
  privacyAttestation?: PrivacyAttestation;
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
  requiredVerificationStatus?: ProviderVerificationStatus;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  allowedModelFamilies: string[];
  allowedAgentFrameworks: AgentFramework[];
  allowedModelProviders: string[];
  allowedModelIds: string[];
  requiredPrivacyFeatures: PrivacyFeatureKey[];
  venicePrivateLane: boolean;
}

export interface BossRaidRoutingDecision {
  providerId: string;
  phase: 'primary' | 'reserve';
  workstreamId?: string;
  workstreamLabel?: string;
  roleId?: string;
  roleLabel?: string;
  modelFamily?: string;
  agentFramework?: AgentFramework;
  modelProvider?: string;
  modelId?: string;
  verificationStatus?: ProviderVerificationStatus;
  rateUsd?: number;
  pricing?: ProviderPricing;
  rateCardHash?: string;
  veniceBacked: boolean;
  erc8004Registered: boolean;
  trustScore: number;
  trustReason?: string;
  operatorWallet?: string;
  registrationTx?: string;
  erc8004VerificationStatus?: Erc8004Verification['status'];
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
    mode: 'multi_agent_synthesis';
    role: 'contributor';
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
  privacyComplianceScore?: number;
  privacyComplianceDetails?: PrivacyComplianceResult;
  finalScore: number;
  valid: boolean;
  invalidReasons: string[];
  summary?: string;
}

export interface PrivacyComplianceResult {
  passed: boolean;
  score: number;
  dataLineageLeak: boolean;
  redactedContentReexposed: boolean;
  externalTransmissionDetected: boolean;
  issues: PrivacyComplianceIssue[];
}

export interface PrivacyComplianceIssue {
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  field?: string;
}

export interface PrivacyComplianceRecord {
  raidId: string;
  privacyMode: PrivacyRoutingMode;
  requiredFeatures: PrivacyFeatureKey[];
  providerAttestations: PrivacyAttestation[];
  perProviderCompliance: Record<string, PrivacyComplianceResult>;
  overallPassed: boolean;
  overallScore: number;
  evaluatedAt: string;
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
  strategy: 'expand' | 'repair';
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
  planningMode?: 'single_raid' | 'hierarchical_parent' | 'hierarchical_child';
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
  escrowFundingUsd?: number;
  platformMarkupUsd?: number;
  paymentProof?: RaidPaymentProof;
  delegations?: RaidDelegationRecord[];
  veniceDirectCalls?: VeniceDirectCallRecord[];
}

export interface SelectedProviders {
  primaries: ProviderProfile[];
  reserves: ProviderProfile[];
}

export type BossRaidSpawnInput = RaidTaskSpec;

export interface BossRaidRequest {
  agent: 'mercenary-v1';
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
    allowedAgentFrameworks?: AgentFramework[];
    requiredProviderIds?: string[];
    allowedModelProviders?: string[];
    allowedModelIds?: string[];
    minReputationScore?: number;
    requireErc8004?: boolean;
    minTrustScore?: number;
    requiredVerificationStatus?: ProviderVerificationStatus;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    privacyMode?: PrivacyRoutingMode;
    requirePrivacyFeatures?: PrivacyFeatureKey[];
    allowedOutputTypes?: OutputType[];
    maxTotalCost?: number | string;
    selectionMode?: SelectionMode;
  };
  hostContext?: HostContext;
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
  mode: 'multi_agent_synthesis';
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
  paymentProof?: RaidPaymentProof;
  delegations?: RaidDelegationRecord[];
  veniceDirectCalls?: VeniceDirectCallRecord[];
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
