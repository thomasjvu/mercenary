import type {
  BossRaidRoutingProof,
  OutputType,
  ProviderProfile,
  RaidRecord,
  SupportedLanguage,
} from '@bossraid/shared-types';
import { buildProviderTrustRecord, buildRoutingProofLog } from './agent-routing-log.js';

export interface BossRaidAgentLog {
  schemaVersion: 'bossraid-agent-log/v1';
  generatedAt: string;
  source: {
    kind: 'derived_from_raid_state';
    note: string;
  };
  agent: {
    id: 'mercenary-v1';
    name: 'Mercenary';
  };
  run: {
    raidId: string;
    status: RaidRecord['status'];
    createdAt: string;
    updatedAt: string;
    parentRaidId?: string;
    planningMode?: RaidRecord['planningMode'];
    childRaidCount: number;
    host: 'codex' | 'claude_code' | null;
    receiptPath?: string;
  };
  task: {
    title: string;
    description: string;
    language: SupportedLanguage;
    framework?: string;
    fileCount: number;
    outputPrimaryType: OutputType;
    artifactTypes: OutputType[];
    constraints: {
      numExperts: number;
      maxBudgetUsd: number;
      maxLatencySec: number;
      allowExternalSearch: boolean;
      privacyMode: string;
      selectionMode: string;
      requireSpecializations: string[];
      allowedModelFamilies: string[];
      allowedAgentFrameworks: string[];
      allowedModelProviders: string[];
      allowedModelIds: string[];
      requirePrivacyFeatures: string[];
      requireErc8004: boolean;
      minTrustScore?: number;
    };
    sanitization: RaidRecord['task']['sanitizationReport'];
  };
  routing?: BossRaidRoutingProof;
  workstreams: Array<{
    raidId: string;
    workstreamId?: string;
    workstreamLabel?: string;
    workstreamObjective?: string;
    roleId?: string;
    roleLabel?: string;
    roleObjective?: string;
    status: RaidRecord['status'];
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
  finalOutput: {
    primaryProviderId?: string;
    approvedProviders: string[];
    supportingProviders: string[];
    droppedProviders: string[];
    workstreamCount: number;
    settlementMode?: string;
    transactionHashes: string[];
    routingPolicy?: BossRaidRoutingProof['policy'];
    routedProviders?: BossRaidRoutingProof['providers'];
    reputationEvents: Array<{
      providerId: string;
      type: string;
      timestamp: string;
    }>;
  };
}

export function buildAgentLog(
  raid: RaidRecord,
  options: {
    getRaid: (raidId: string) => RaidRecord | undefined;
    getProvider?: (providerId: string) => ProviderProfile | undefined;
    raidAccessToken?: string;
  }
): BossRaidAgentLog {
  const childRaids = collectChildRaids(raid, options.getRaid);
  const executionRaids = childRaids.length ? childRaids : [raid];
  const routingProof = buildRoutingProofLog(raid, executionRaids, options.getProvider);
  const approvedProviders = uniqueSorted(
    raid.synthesizedOutput?.contributingProviderIds ??
      raid.rankedSubmissions
        .filter((entry) => entry.breakdown.valid)
        .map((entry) => entry.submission.providerId)
  );
  const supportingProviders = uniqueSorted(
    (raid.synthesizedOutput?.supportingProviderIds ?? []).filter(
      (providerId) => !approvedProviders.includes(providerId)
    )
  );
  const droppedProviders = uniqueSorted(raid.synthesizedOutput?.droppedProviderIds ?? []);

  return {
    schemaVersion: 'bossraid-agent-log/v1',
    generatedAt: new Date().toISOString(),
    source: {
      kind: 'derived_from_raid_state',
      note: 'This log is derived from persisted raid state, assignment timestamps, ranked submissions, settlement artifacts, and reputation events. It does not invent steps that were not recorded.',
    },
    agent: {
      id: 'mercenary-v1',
      name: 'Mercenary',
    },
    run: {
      raidId: raid.id,
      status: raid.status,
      createdAt: raid.createdAt,
      updatedAt: raid.updatedAt,
      parentRaidId: raid.parentRaidId,
      planningMode: raid.planningMode,
      childRaidCount: childRaids.length,
      host: raid.task.hostContext?.host ?? null,
      receiptPath:
        options.raidAccessToken == null
          ? undefined
          : `/verification?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(options.raidAccessToken)}`,
    },
    task: {
      title: raid.task.taskTitle,
      description: raid.task.taskDescription,
      language: raid.task.language,
      framework: raid.task.framework,
      fileCount: raid.task.files.length,
      outputPrimaryType: raid.task.output?.primaryType ?? 'patch',
      artifactTypes: raid.task.output?.artifactTypes ?? [raid.task.output?.primaryType ?? 'patch'],
      constraints: {
        numExperts: raid.task.constraints.numExperts,
        maxBudgetUsd: raid.task.constraints.maxBudgetUsd,
        maxLatencySec: raid.task.constraints.maxLatencySec,
        allowExternalSearch: raid.task.constraints.allowExternalSearch,
        privacyMode: raid.task.constraints.privacyMode ?? 'off',
        selectionMode:
          raid.task.constraints.selectionMode ??
          (raid.task.constraints.privacyMode && raid.task.constraints.privacyMode !== 'off'
            ? 'privacy_first'
            : 'best_match'),
        requireSpecializations: raid.task.constraints.requireSpecializations,
        allowedModelFamilies: raid.task.constraints.allowedModelFamilies ?? [],
        allowedAgentFrameworks: raid.task.constraints.allowedAgentFrameworks ?? [],
        allowedModelProviders: raid.task.constraints.allowedModelProviders ?? [],
        allowedModelIds: raid.task.constraints.allowedModelIds ?? [],
        requirePrivacyFeatures: raid.task.constraints.requirePrivacyFeatures ?? [],
        requireErc8004: raid.task.constraints.requireErc8004 === true,
        minTrustScore: raid.task.constraints.minTrustScore,
      },
      sanitization: raid.task.sanitizationReport,
    },
    routing: routingProof,
    workstreams: executionRaids.map((currentRaid) => ({
      raidId: currentRaid.id,
      workstreamId: currentRaid.contributionPlan?.workstreamId,
      workstreamLabel: currentRaid.contributionPlan?.workstreamLabel,
      workstreamObjective: currentRaid.contributionPlan?.workstreamObjective,
      roleId: currentRaid.contributionPlan?.roleId,
      roleLabel: currentRaid.contributionPlan?.roleLabel,
      roleObjective: currentRaid.contributionPlan?.roleObjective,
      status: currentRaid.status,
      providers: Object.keys(currentRaid.assignments),
      approvedProviders: currentRaid.rankedSubmissions
        .filter((entry) => entry.breakdown.valid)
        .map((entry) => entry.submission.providerId),
    })),
    decisions: buildDecisionLog(raid, executionRaids, options.getProvider),
    toolCalls: buildToolCallLog(raid, executionRaids),
    retries: buildRetryLog(executionRaids),
    failures: buildFailureLog(executionRaids),
    finalOutput: {
      primaryProviderId: raid.primarySubmissionId,
      approvedProviders,
      supportingProviders,
      droppedProviders,
      workstreamCount: raid.synthesizedOutput?.workstreams.length ?? executionRaids.length,
      settlementMode: raid.settlementExecution?.mode,
      transactionHashes: raid.settlementExecution?.transactionHashes ?? [],
      routingPolicy: routingProof?.policy,
      routedProviders: routingProof?.providers,
      reputationEvents: (raid.reputationEvents ?? []).map((event) => ({
        providerId: event.providerId,
        type: event.type,
        timestamp: event.timestamp,
      })),
    },
  };
}

function buildDecisionLog(
  rootRaid: RaidRecord,
  executionRaids: RaidRecord[],
  getProvider?: (providerId: string) => ProviderProfile | undefined
) {
  const approvedSubmissions = rootRaid.rankedSubmissions.filter((entry) => entry.breakdown.valid);
  const childSummary =
    executionRaids.length > 1
      ? `${executionRaids.length} child raids across ${uniqueSorted(executionRaids.map((raid) => raid.contributionPlan?.workstreamLabel).filter((value): value is string => Boolean(value))).length} workstreams`
      : 'single raid execution';
  const selectedProviderTrust = rootRaid.selectedProviders.map((providerId) =>
    buildProviderTrustRecord(providerId, getProvider?.(providerId))
  );
  const routingProof = buildRoutingProofLog(rootRaid, executionRaids, getProvider);

  return [
    {
      at: rootRaid.createdAt,
      type: 'discover_task',
      status: 'complete' as const,
      summary: `Accepted ${rootRaid.task.language} task from ${rootRaid.task.hostContext?.host ?? 'unknown host'}.`,
      data: {
        fileCount: rootRaid.task.files.length,
        outputPrimaryType: rootRaid.task.output?.primaryType ?? 'patch',
      },
    },
    {
      at: rootRaid.createdAt,
      type: 'sanitize_and_plan',
      status: 'complete' as const,
      summary: `Sanitized task input and planned ${childSummary}.`,
      data: {
        riskTier: rootRaid.task.sanitizationReport.riskTier,
        selectedProviders: rootRaid.selectedProviders,
        reserveProviders: rootRaid.reserveProviders,
        requireErc8004: rootRaid.task.constraints.requireErc8004 === true,
        minTrustScore: rootRaid.task.constraints.minTrustScore,
        allowedModelFamilies: rootRaid.task.constraints.allowedModelFamilies ?? [],
        allowedAgentFrameworks: rootRaid.task.constraints.allowedAgentFrameworks ?? [],
        allowedModelProviders: rootRaid.task.constraints.allowedModelProviders ?? [],
        allowedModelIds: rootRaid.task.constraints.allowedModelIds ?? [],
        selectedProviderTrust,
        selectedProviderRouting: routingProof?.providers ?? [],
      },
    },
    {
      at: approvedSubmissions[0]?.submission.submittedAt ?? rootRaid.updatedAt,
      type: 'verify_outputs',
      status: approvedSubmissions.length ? ('complete' as const) : ('pending' as const),
      summary: approvedSubmissions.length
        ? `Approved ${approvedSubmissions.length} provider submissions after evaluation.`
        : 'No provider output approved yet.',
      data: {
        approvedProviders: approvedSubmissions.map((entry) => entry.submission.providerId),
        droppedProviders: rootRaid.synthesizedOutput?.droppedProviderIds ?? [],
      },
    },
    {
      at: rootRaid.updatedAt,
      type: 'submit_result',
      status: rootRaid.status === 'final' ? ('complete' as const) : ('pending' as const),
      summary:
        rootRaid.status === 'final'
          ? 'Finalized the canonical multi-agent synthesis result.'
          : `Raid is currently ${rootRaid.status}.`,
      data: {
        primaryProviderId: rootRaid.primarySubmissionId,
        settlementMode: rootRaid.settlementExecution?.mode,
      },
    },
    ...(rootRaid.paymentProof
      ? [
          {
            at: rootRaid.paymentProof.delegationChain?.at(-1)?.at ?? rootRaid.updatedAt,
            type: 'payment_redelegation' as const,
            status: 'complete' as const,
            summary: `Paid raid via ${rootRaid.paymentProof.method} x402 settlement.`,
            data: {
              payer: rootRaid.paymentProof.payer,
              transaction: rootRaid.paymentProof.transaction,
              facilitatorUrl: rootRaid.paymentProof.facilitatorUrl,
              delegationChain: rootRaid.paymentProof.delegationChain,
              oneshotTaskId: rootRaid.paymentProof.oneshotTaskId,
            },
          },
        ]
      : []),
    ...(rootRaid.veniceDirectCalls ?? []).map((call) => ({
      at: call.at,
      type: call.phase === 'plan' ? ('venice_plan' as const) : ('venice_synthesize' as const),
      status: 'complete' as const,
      summary: call.summary ?? `Venice ${call.phase} call via ${call.model}.`,
      data: {
        model: call.model,
        balanceRemainingUsd: call.balanceRemainingUsd,
      },
    })),
    ...(rootRaid.delegations ?? []).map((delegation) => ({
      at: delegation.delegatedAt,
      type: 'workstream_redelegate' as const,
      status: 'complete' as const,
      summary: `Mercenary redelegated ${delegation.workstreamLabel ?? 'workstream'} to ${delegation.toProvider}.`,
      data: delegation as unknown as Record<string, unknown>,
    })),
  ];
}

function buildToolCallLog(rootRaid: RaidRecord, executionRaids: RaidRecord[]) {
  const toolCalls: BossRaidAgentLog['toolCalls'] = [
    {
      at: rootRaid.createdAt,
      tool: 'sanitize_task',
      kind: 'internal',
      status: 'complete',
      details: {
        riskTier: rootRaid.task.sanitizationReport.riskTier,
        redactedSecrets: rootRaid.task.sanitizationReport.redactedSecrets,
        redactedIdentifiers: rootRaid.task.sanitizationReport.redactedIdentifiers,
      },
    },
  ];

  if (executionRaids.length > 1) {
    toolCalls.push({
      at: rootRaid.createdAt,
      tool: 'partition_workstreams',
      kind: 'internal',
      status: 'complete',
      details: {
        childRaidCount: executionRaids.length,
        workstreams: uniqueSorted(
          executionRaids
            .map((raid) => raid.contributionPlan?.workstreamLabel)
            .filter((value): value is string => Boolean(value))
        ),
      },
    });
  }

  for (const raid of executionRaids) {
    for (const assignment of Object.values(raid.assignments)) {
      const redelegation = (raid.delegations ?? []).find(
        (entry) => entry.toProvider === assignment.providerId
      );
      if (redelegation) {
        toolCalls.push({
          at: redelegation.delegatedAt,
          tool: 'agent_redelegate',
          kind: 'http',
          status: assignment.status,
          target: assignment.providerId,
          details: {
            fromAgent: redelegation.fromAgent,
            budgetCapUsd: redelegation.budgetCapUsd,
            workstreamId: redelegation.workstreamId,
            workstreamLabel: redelegation.workstreamLabel,
          },
        });
      }

      if (assignment.invitedAt) {
        toolCalls.push({
          at: assignment.invitedAt,
          tool: 'provider_http_invite',
          kind: 'http',
          status: assignment.status,
          target: assignment.providerId,
          details: {
            workstream: raid.contributionPlan?.workstreamLabel,
            role: raid.contributionPlan?.roleLabel,
          },
        });
      }

      if (assignment.acceptedAt) {
        toolCalls.push({
          at: assignment.acceptedAt,
          tool: 'provider_http_accept',
          kind: 'http',
          status: 'accepted',
          target: assignment.providerId,
          details: {
            providerRunId: assignment.providerRunId,
          },
        });
      }

      if (assignment.firstHeartbeatAt) {
        toolCalls.push({
          at: assignment.firstHeartbeatAt,
          tool: 'provider_http_run',
          kind: 'http',
          status: 'running',
          target: assignment.providerId,
          details: {
            providerRunId: assignment.providerRunId,
            latencyMs: assignment.latencyMs,
          },
        });
      }

      if (assignment.submittedAt) {
        toolCalls.push({
          at: assignment.submittedAt,
          tool: 'evaluate_submission',
          kind: 'evaluation',
          status: assignment.status,
          target: assignment.providerId,
          details: {
            providerRunId: assignment.providerRunId,
            latencyMs: assignment.latencyMs,
          },
        });
      }
    }
  }

  if (rootRaid.settlementExecution) {
    toolCalls.push({
      at: rootRaid.settlementExecution.executedAt,
      tool: 'settle_raid',
      kind: 'settlement',
      status: 'complete',
      details: {
        mode: rootRaid.settlementExecution.mode,
        proofStandard: rootRaid.settlementExecution.proofStandard,
        lifecycleStatus: rootRaid.settlementExecution.lifecycleStatus,
        registryAddress: rootRaid.settlementExecution.contracts.registryAddress,
        escrowAddress: rootRaid.settlementExecution.contracts.escrowAddress,
        registryRaidRef: rootRaid.settlementExecution.registryRaidRef,
        finalizeTxHash: rootRaid.settlementExecution.finalizeTxHash,
        transactionHashes: rootRaid.settlementExecution.transactionHashes ?? [],
        warnings: rootRaid.settlementExecution.warnings ?? [],
      },
    });
  }

  return toolCalls.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function buildRetryLog(executionRaids: RaidRecord[]) {
  return executionRaids
    .flatMap((raid) =>
      Object.values(raid.assignments)
        .filter((assignment) => assignment.message === 'promoted from reserve')
        .map((assignment) => ({
          at:
            assignment.timeoutAt ?? assignment.acceptedAt ?? assignment.invitedAt ?? raid.updatedAt,
          type: 'reserve_promotion',
          summary: `${assignment.providerId} was promoted from reserve for ${raid.contributionPlan?.workstreamLabel ?? raid.id}.`,
        }))
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function buildFailureLog(executionRaids: RaidRecord[]) {
  return executionRaids
    .flatMap((raid) =>
      Object.values(raid.assignments)
        .filter((assignment) =>
          ['invalid', 'timed_out', 'failed', 'disqualified'].includes(assignment.status)
        )
        .map((assignment) => ({
          at:
            assignment.timeoutAt ??
            assignment.submittedAt ??
            assignment.acceptedAt ??
            assignment.invitedAt ??
            raid.updatedAt,
          stage: assignment.status,
          providerId: assignment.providerId,
          summary: assignment.message ?? `${assignment.providerId} ended in ${assignment.status}.`,
        }))
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function collectChildRaids(
  rootRaid: RaidRecord,
  getRaid: (raidId: string) => RaidRecord | undefined
): RaidRecord[] {
  const collected: RaidRecord[] = [];

  for (const childRaidId of rootRaid.childRaidIds ?? []) {
    const childRaid = getRaid(childRaidId);
    if (!childRaid) {
      continue;
    }
    collected.push(childRaid, ...collectChildRaids(childRaid, getRaid));
  }

  return collected;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.length > 0))),
  ].sort();
}
