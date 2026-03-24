import type {
  BossRaidResultOutput,
  BossRaidStatusOutput,
} from "@bossraid/shared-types";

const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);

export function summarizeRaidReceipt(status: BossRaidStatusOutput, result: BossRaidResultOutput) {
  return {
    raidId: result.raidId,
    status: status.status,
    firstValidAvailable: status.firstValidAvailable,
    bestCurrentScore: status.bestCurrentScore,
    experts: status.experts.map((expert) => ({
      providerId: expert.providerId,
      status: expert.status,
      latencyMs: expert.latencyMs,
      heartbeatAgeMs: expert.heartbeatAgeMs,
      progress: expert.progress,
      message: expert.message,
    })),
    sanitization: status.sanitization,
    synthesizedOutput:
      result.synthesizedOutput == null
        ? undefined
        : summarizeSynthesizedOutput(result.synthesizedOutput),
    primaryResponse: result.primarySubmission == null ? undefined : summarizePrimarySubmission(result.primarySubmission),
    approvedProviders: (result.approvedSubmissions ?? []).map((entry) => ({
      providerId: entry.submission.providerId,
      rank: entry.rank,
      finalScore: entry.breakdown.finalScore,
      confidence: entry.submission.confidence,
      filesTouched: entry.submission.filesTouched,
    })),
    routingProof:
      result.routingProof == null
        ? undefined
        : {
            policy: { ...result.routingProof.policy },
            providers: result.routingProof.providers.map((decision) => ({ ...decision })),
          },
    rankedSubmissions: (result.rankedSubmissions ?? []).map((entry) => summarizeRankedSubmission(entry)),
    settlement: result.settlement,
    settlementExecution:
      result.settlementExecution == null
        ? undefined
        : {
            ...result.settlementExecution,
            successfulProviderIds: [...result.settlementExecution.successfulProviderIds],
            contracts: { ...result.settlementExecution.contracts },
            registryCall: {
              ...result.settlementExecution.registryCall,
              args: [...result.settlementExecution.registryCall.args] as [string, string],
            },
            childJobs: result.settlementExecution.childJobs.map((job) => ({ ...job })),
            allocations: result.settlementExecution.allocations.map((allocation) => ({ ...allocation })),
            transactionHashes: result.settlementExecution.transactionHashes
              ? [...result.settlementExecution.transactionHashes]
              : undefined,
            jobIds: result.settlementExecution.jobIds ? [...result.settlementExecution.jobIds] : undefined,
            warnings: result.settlementExecution.warnings ? [...result.settlementExecution.warnings] : undefined,
          },
    reputationEvents: result.reputationEvents ?? [],
    pollTools: TERMINAL_RAID_STATUSES.has(status.status) ? undefined : ["bossraid_status", "bossraid_result", "bossraid_receipt"],
  };
}

function summarizeSynthesizedOutput(output: NonNullable<BossRaidResultOutput["synthesizedOutput"]>) {
  return {
    primaryType: output.primaryType,
    answerText: output.answerText,
    patchUnifiedDiff: output.patchUnifiedDiff,
    artifacts: output.artifacts,
    explanation: output.explanation,
    baseSubmissionProviderId: output.baseSubmissionProviderId,
    contributingProviderIds: output.contributingProviderIds,
    supportingProviderIds: output.supportingProviderIds,
    droppedProviderIds: output.droppedProviderIds,
    contributions: output.contributions,
    workstreams: output.workstreams,
  };
}

function summarizePrimarySubmission(entry: NonNullable<BossRaidResultOutput["primarySubmission"]>) {
  return {
    providerId: entry.submission.providerId,
    contributionRole: entry.submission.contributionRole,
    rank: entry.rank,
    valid: entry.breakdown.valid,
    finalScore: entry.breakdown.finalScore,
    confidence: entry.submission.confidence,
    explanation: entry.submission.explanation,
    answerText: entry.submission.answerText,
    patchUnifiedDiff: entry.submission.patchUnifiedDiff,
    artifacts: entry.submission.artifacts,
    filesTouched: entry.submission.filesTouched,
    invalidReasons: entry.breakdown.invalidReasons,
    summary: entry.breakdown.summary,
  };
}

function summarizeRankedSubmission(entry: NonNullable<BossRaidResultOutput["rankedSubmissions"]>[number]) {
  return {
    providerId: entry.submission.providerId,
    contributionRole: entry.submission.contributionRole,
    rank: entry.rank,
    valid: entry.breakdown.valid,
    finalScore: entry.breakdown.finalScore,
    confidence: entry.submission.confidence,
    invalidReasons: entry.breakdown.invalidReasons,
    summary: entry.breakdown.summary,
    artifacts: entry.submission.artifacts,
    filesTouched: entry.submission.filesTouched,
  };
}
