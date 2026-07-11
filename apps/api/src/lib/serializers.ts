import { buildQuoteExplorerUrl } from '@bossraid/privacy-engine';
import type {
  BossRaidResultOutput,
  BossRaidStatusOutput,
  PrivacyAttestation,
  PrivacyAttestationView,
  PrivacyComplianceRecord,
  PrivacyComplianceRecordView,
  ProviderHealthStatus,
  ProviderProfile,
  ProviderViewResponse,
  ProviderHealthViewResponse,
  RaidListItemResponse,
  RaidRecord,
  RaidResultResponse,
  RaidStatusResponse,
  RankedSubmission,
  RankedSubmissionResponse,
  SanitizationReport,
  SettlementExecutionRecord,
  SettlementExecutionResponse,
  SubmissionArtifact,
  SubmissionArtifactView,
  TeeAttestationResult,
  TeeAttestationView,
} from '@bossraid/shared-types';

function serializeProviderSource(
  source: ProviderProfile['source']
): ProviderViewResponse['source'] | undefined {
  if (!source) {
    return undefined;
  }

  const targetType = source.targetType?.trim().toLowerCase();
  const externalRef = source.externalRef?.trim();
  return {
    type: source.type,
    partyQuestAgentId: targetType === 'formation' ? undefined : externalRef,
    partyQuestFormationId: targetType === 'formation' ? externalRef : undefined,
  };
}

export function serializeProviderProfile(
  provider: ProviderProfile,
  options: { includeEndpoint?: boolean } = {}
): ProviderViewResponse {
  return {
    providerId: provider.providerId,
    agentId: provider.agentId,
    displayName: provider.displayName,
    description: provider.description,
    endpointType: provider.endpointType,
    endpoint: options.includeEndpoint ? provider.endpoint : undefined,
    specializations: provider.specializations,
    supportedLanguages: provider.supportedLanguages,
    supportedFrameworks: provider.supportedFrameworks,
    pricing: provider.pricing,
    pricePerTaskUsd: provider.pricePerTaskUsd,
    maxConcurrency: provider.maxConcurrency,
    status: provider.status,
    modelFamily: provider.modelFamily,
    agentFramework: provider.agentFramework,
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    outputTypes: provider.outputTypes,
    verification: provider.verification,
    privacy: provider.privacy,
    erc8004: provider.erc8004,
    trust: provider.trust,
    reputation: provider.reputation,
    scores: provider.scores,
    lastSeenAt: provider.lastSeenAt,
    source: serializeProviderSource(provider.source),
    marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
    harnessProfile: provider.harnessProfile,
  };
}

export function serializeProviderHealth(
  health: ProviderHealthStatus,
  options: { includeDiagnostics?: boolean; includeEndpoint?: boolean } = {}
): ProviderHealthViewResponse {
  return {
    providerId: health.providerId,
    providerName: health.providerName,
    endpoint: options.includeEndpoint ? health.endpoint : undefined,
    reachable: health.reachable,
    ready: health.ready,
    statusCode: health.statusCode,
    model: health.model,
    missing: options.includeDiagnostics ? health.missing : undefined,
    modelApiBase: options.includeDiagnostics ? health.modelApiBase : undefined,
    error: options.includeDiagnostics ? health.error : undefined,
  };
}

function serializeSanitization(report: SanitizationReport): RaidStatusResponse['sanitization'] {
  return {
    riskTier: report.riskTier,
    redactedSecrets: report.redactedSecrets,
    redactedIdentifiers: report.redactedIdentifiers,
    trimmedFiles: report.trimmedFiles,
  };
}

function serializeSubmissionArtifact(artifact: SubmissionArtifact): SubmissionArtifactView {
  return {
    outputType: artifact.outputType,
    label: artifact.label,
    uri: artifact.uri,
    mimeType: artifact.mimeType,
    description: artifact.description,
    sha256: artifact.sha256,
  };
}

export function serializeTeeAttestation(tee: TeeAttestationResult): TeeAttestationView {
  const explorerUrl = tee.explorerUrl ?? buildQuoteExplorerUrl(tee.signature);
  return {
    valid: tee.valid,
    providerId: tee.providerId,
    verifiedAt: tee.verifiedAt,
    expiresAt: tee.expiresAt,
    vendor: tee.vendor,
    enclaveHash: tee.enclaveHash,
    signature: tee.signature,
    runtimeMode: tee.runtimeMode,
    notes: tee.notes,
    upstreamVendor: tee.upstreamVendor,
    signingAddress: tee.signingAddress,
    e2eeReady: tee.e2eeReady,
    explorerUrl,
    checks: tee.checks,
  };
}

function serializePrivacyAttestation(attestation: PrivacyAttestation): PrivacyAttestationView {
  return {
    providerId: attestation.providerId,
    raidId: attestation.raidId,
    submittedAt: attestation.submittedAt,
    featuresClaimed: attestation.featuresClaimed,
    featuresVerified: attestation.featuresVerified,
    teeAttestation: attestation.teeAttestation
      ? serializeTeeAttestation(attestation.teeAttestation)
      : undefined,
    inferenceReceiptId: attestation.inferenceReceiptId,
    externalApiCalls: attestation.externalApiCalls,
    dataRetained: attestation.dataRetained,
    signedDeclaration: attestation.signedDeclaration,
  };
}

function serializePrivacyComplianceRecord(
  record: PrivacyComplianceRecord
): PrivacyComplianceRecordView {
  return {
    raidId: record.raidId,
    privacyMode: record.privacyMode,
    requiredFeatures: record.requiredFeatures,
    providerAttestations: record.providerAttestations.map(serializePrivacyAttestation),
    perProviderCompliance: record.perProviderCompliance,
    overallPassed: record.overallPassed,
    overallScore: record.overallScore,
    evaluatedAt: record.evaluatedAt,
  };
}

function serializeSettlementExecution(
  execution: SettlementExecutionRecord
): SettlementExecutionResponse {
  return {
    mode: execution.mode,
    proofStandard: execution.proofStandard,
    lifecycleStatus: execution.lifecycleStatus,
    executedAt: execution.executedAt,
    artifactPath: execution.artifactPath,
    registryRaidRef: execution.registryRaidRef,
    taskHash: execution.taskHash,
    evaluationHash: execution.evaluationHash,
    successfulProviderIds: execution.successfulProviderIds,
    privacyCompliance: execution.privacyCompliance
      ? serializePrivacyComplianceRecord(execution.privacyCompliance)
      : undefined,
    contracts: execution.contracts,
    registryCall: execution.registryCall,
    childJobs: execution.childJobs,
    finalizeTxHash: execution.finalizeTxHash,
    transactionHashes: execution.transactionHashes,
    jobIds: execution.jobIds,
    warnings: execution.warnings,
    allocations: execution.allocations,
  };
}

function serializeRankedSubmission(entry: RankedSubmission): RankedSubmissionResponse {
  return {
    submission: {
      providerId: entry.submission.providerId,
      explanation: entry.submission.explanation,
      patchUnifiedDiff: entry.submission.patchUnifiedDiff,
      answerText: entry.submission.answerText,
      artifacts: entry.submission.artifacts?.map(serializeSubmissionArtifact),
      confidence: entry.submission.confidence,
      contributionRole: entry.submission.contributionRole,
      privacyAttestation: entry.submission.privacyAttestation
        ? serializePrivacyAttestation(entry.submission.privacyAttestation)
        : undefined,
    },
    breakdown: {
      finalScore: entry.breakdown.finalScore,
      buildScore: entry.breakdown.buildScore,
      testScore: entry.breakdown.testScore,
      correctnessRubric: entry.breakdown.correctnessRubric,
      sideEffectSafety: entry.breakdown.sideEffectSafety,
      explanationScore: entry.breakdown.explanationScore,
      latencyScore: entry.breakdown.latencyScore,
      uniquenessScore: entry.breakdown.uniquenessScore,
      valid: entry.breakdown.valid,
      invalidReasons: entry.breakdown.invalidReasons,
      summary: entry.breakdown.summary,
    },
    rank: entry.rank,
  };
}

export function serializeRaidStatus(status: BossRaidStatusOutput): RaidStatusResponse {
  return {
    raidId: status.raidId,
    status: status.status,
    experts: status.experts.map((expert) => ({
      providerId: expert.providerId,
      status: expert.status,
      latencyMs: expert.latencyMs,
      heartbeatAgeMs: expert.heartbeatAgeMs,
      progress: expert.progress,
      message: expert.message,
    })),
    firstValidAvailable: status.firstValidAvailable,
    bestCurrentScore: status.bestCurrentScore,
    sanitization: serializeSanitization(status.sanitization),
  };
}

export function serializeRaidResult(result: BossRaidResultOutput): RaidResultResponse {
  return {
    raidId: result.raidId,
    status: result.status,
    routingProof: result.routingProof,
    synthesizedOutput: result.synthesizedOutput
      ? {
          ...result.synthesizedOutput,
          artifacts: result.synthesizedOutput.artifacts?.map(serializeSubmissionArtifact),
          workstreams: result.synthesizedOutput.workstreams.map((workstream) => ({
            ...workstream,
            artifacts: workstream.artifacts?.map(serializeSubmissionArtifact),
          })),
        }
      : undefined,
    primarySubmission: result.primarySubmission
      ? serializeRankedSubmission(result.primarySubmission)
      : undefined,
    approvedSubmissions: result.approvedSubmissions?.map(serializeRankedSubmission),
    rankedSubmissions: result.rankedSubmissions?.map(serializeRankedSubmission),
    settlement: result.settlement,
    settlementExecution: result.settlementExecution
      ? serializeSettlementExecution(result.settlementExecution)
      : undefined,
    reputationEvents: result.reputationEvents?.map((event) => ({
      providerId: event.providerId,
      type: event.type,
      timestamp: event.timestamp,
    })),
  };
}

export function toRaidListItemResponse(raid: RaidRecord): RaidListItemResponse {
  return {
    raidId: raid.id,
    status: raid.status,
    createdAt: raid.createdAt,
    updatedAt: raid.updatedAt,
    bestCurrentScore: raid.bestCurrentScore,
    firstValidSubmissionId: raid.firstValidSubmissionId,
    primarySubmissionId: raid.primarySubmissionId,
    successfulSubmissionCount: raid.rankedSubmissions.filter((item) => item.breakdown.valid).length,
  };
}
