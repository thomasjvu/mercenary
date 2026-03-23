import type { BossRaidOrchestrator } from "@bossraid/orchestrator";
import { computeTrustScore, erc8004IdentityIsRegistered, providerHasErc8004Identity } from "@bossraid/provider-registry";
import type {
  BossRaidRoutingProof,
  Erc8004Identity,
  OutputType,
  PrivacyFeatureKey,
  ProviderProfile,
  RaidRecord,
  SupportedLanguage,
} from "@bossraid/shared-types";

export interface BossRaidAgentManifest {
  schemaVersion: "bossraid-agent-manifest/v1";
  generatedAt: string;
  agent: {
    id: "mercenary-v1";
    name: "Mercenary";
    platform: "Boss Raid";
    description: string;
    identity: {
      erc8004Configured: boolean;
      agentId: string | null;
      operatorWallet: string | null;
      registrationTx: string | null;
      identityRegistry: string | null;
      reputationRegistry: string | null;
      validationRegistry: string | null;
      status: "registered" | "unconfigured";
    };
  };
  endpoints: {
    nativeRaid: "POST /v1/raid";
    compatibleChat: "POST /v1/chat/completions";
    manifest: "GET /v1/agent.json";
    agentLogTemplate: "GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>";
    publicReceiptTemplate: "/receipt?raidId=<raidId>&token=<raidAccessToken>";
    mcpTools: string[];
  };
  capabilities: {
    taskCategories: string[];
    outputTypes: OutputType[];
    tools: string[];
    techStack: string[];
    supportedHosts: Array<"codex" | "claude_code">;
    supportedLanguages: SupportedLanguage[];
  };
  computeConstraints: {
    providerTransport: "http";
    runtimeExecutionRequested: boolean;
    runtimeExecutionEnabled: boolean;
    evaluatorTransport: string;
    workerIsolation: "per_job_process" | "per_job_container";
    maxEvaluatorJobs: number;
    teeAttested: boolean;
    teeWalletAddress: string | null;
  };
  providerPool: {
    totalProviders: number;
    providerIds: string[];
    specializations: string[];
    modelFamilies: string[];
    privacyFeatures: string[];
    erc8004RegisteredProviders: number;
    trustScoredProviders: number;
    averageTrustScore: number;
  };
  notes: string[];
}

export interface BossRaidAgentLog {
  schemaVersion: "bossraid-agent-log/v1";
  generatedAt: string;
  source: {
    kind: "derived_from_raid_state";
    note: string;
  };
  agent: {
    id: "mercenary-v1";
    name: "Mercenary";
  };
  run: {
    raidId: string;
    status: RaidRecord["status"];
    createdAt: string;
    updatedAt: string;
    parentRaidId?: string;
    planningMode?: RaidRecord["planningMode"];
    childRaidCount: number;
    host: "codex" | "claude_code" | null;
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
      requirePrivacyFeatures: string[];
      requireErc8004: boolean;
      minTrustScore?: number;
    };
    sanitization: RaidRecord["task"]["sanitizationReport"];
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
    status: RaidRecord["status"];
    providers: string[];
    approvedProviders: string[];
  }>;
  decisions: Array<{
    at: string;
    type: string;
    status: "complete" | "pending";
    summary: string;
    data?: Record<string, unknown>;
  }>;
  toolCalls: Array<{
    at: string;
    tool: string;
    kind: "internal" | "http" | "evaluation" | "settlement";
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
    routingPolicy?: BossRaidRoutingProof["policy"];
    routedProviders?: BossRaidRoutingProof["providers"];
    reputationEvents: Array<{
      providerId: string;
      type: string;
      timestamp: string;
    }>;
  };
}

export function buildAgentManifest(
  orchestrator: BossRaidOrchestrator,
  options: {
    runtimeExecutionRequested: boolean;
    runtimeExecutionEnabled: boolean;
    evaluatorTransport: string;
    workerIsolation: "per_job_process" | "per_job_container";
    maxEvaluatorJobs: number;
    teeWalletAddress: string | null;
    mercenaryIdentity?: Erc8004Identity;
  },
): BossRaidAgentManifest {
  const providers = orchestrator.listProviders();
  const mercenaryIdentity = options.mercenaryIdentity;
  const mercenaryRegistered = erc8004IdentityIsRegistered(mercenaryIdentity);
  const providerTrustScores = providers.map((provider) => computeTrustScore(provider)).filter((score) => score > 0);
  return {
    schemaVersion: "bossraid-agent-manifest/v1",
    generatedAt: new Date().toISOString(),
    agent: {
      id: "mercenary-v1",
      name: "Mercenary",
      platform: "Boss Raid",
      description:
        "Mercenary is the Boss Raid orchestrator agent. It turns one task into scoped specialist workstreams, routes them to HTTP providers, verifies outputs, synthesizes one canonical result, and settles only approved contributors.",
      identity: {
        erc8004Configured: mercenaryRegistered,
        agentId: mercenaryIdentity?.agentId ?? null,
        operatorWallet: mercenaryIdentity?.operatorWallet ?? null,
        registrationTx: mercenaryIdentity?.registrationTx ?? null,
        identityRegistry: mercenaryIdentity?.identityRegistry ?? null,
        reputationRegistry: mercenaryIdentity?.reputationRegistry ?? null,
        validationRegistry: mercenaryIdentity?.validationRegistry ?? null,
        status: mercenaryRegistered ? "registered" : "unconfigured",
      },
    },
    endpoints: {
      nativeRaid: "POST /v1/raid",
      compatibleChat: "POST /v1/chat/completions",
      manifest: "GET /v1/agent.json",
      agentLogTemplate: "GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>",
      publicReceiptTemplate: "/receipt?raidId=<raidId>&token=<raidAccessToken>",
      mcpTools: ["bossraid_delegate", "bossraid_receipt", "bossraid_status", "bossraid_result"],
    },
    capabilities: {
      taskCategories: ["code_review", "debugging", "document_analysis", "game_build", "multi_agent_coordination"],
      outputTypes: ["text", "patch", "json", "image", "video", "bundle"],
      tools: ["provider_http_dispatch", "evaluator", "x402", "settlement", "mcp", "openai_compatible_chat"],
      techStack: ["TypeScript", "Fastify", "MCP", "x402", "Base", "EigenCompute"],
      supportedHosts: ["codex", "claude_code"],
      supportedLanguages: collectSupportedLanguages(providers),
    },
    computeConstraints: {
      providerTransport: "http",
      runtimeExecutionRequested: options.runtimeExecutionRequested,
      runtimeExecutionEnabled: options.runtimeExecutionEnabled,
      evaluatorTransport: options.evaluatorTransport,
      workerIsolation: options.workerIsolation,
      maxEvaluatorJobs: options.maxEvaluatorJobs,
      teeAttested: options.teeWalletAddress != null,
      teeWalletAddress: options.teeWalletAddress,
    },
    providerPool: {
      totalProviders: providers.length,
      providerIds: providers.map((provider) => provider.providerId),
      specializations: uniqueSorted(providers.flatMap((provider) => provider.specializations)),
      modelFamilies: uniqueSorted(providers.map((provider) => provider.modelFamily).filter((value): value is string => Boolean(value))),
      privacyFeatures: uniqueSorted(providers.flatMap(readProviderPrivacyFeatures)),
      erc8004RegisteredProviders: providers.filter((provider) => providerHasErc8004Identity(provider)).length,
      trustScoredProviders: providerTrustScores.length,
      averageTrustScore:
        providerTrustScores.length > 0
          ? Math.round(providerTrustScores.reduce((total, score) => total + score, 0) / providerTrustScores.length)
          : 0,
    },
    notes: [
      "This manifest is generated from the live Boss Raid runtime and provider registry.",
      mercenaryRegistered
        ? "Mercenary ERC-8004 identity is configured and exposed as a load-bearing routing proof."
        : "Mercenary ERC-8004 identity remains unconfigured until real onchain registration is wired.",
      "Use the per-raid agent_log.json route to inspect one autonomous run end to end.",
    ],
  };
}

export function buildAgentLog(
  raid: RaidRecord,
  options: {
    getRaid: (raidId: string) => RaidRecord | undefined;
    getProvider?: (providerId: string) => ProviderProfile | undefined;
    raidAccessToken?: string;
  },
): BossRaidAgentLog {
  const childRaids = collectChildRaids(raid, options.getRaid);
  const executionRaids = childRaids.length ? childRaids : [raid];
  const routingProof = buildRoutingProofLog(raid, executionRaids, options.getProvider);
  const approvedProviders = uniqueSorted(
    (raid.synthesizedOutput?.contributingProviderIds ?? raid.rankedSubmissions.filter((entry) => entry.breakdown.valid).map((entry) => entry.submission.providerId)),
  );
  const supportingProviders = uniqueSorted(
    (raid.synthesizedOutput?.supportingProviderIds ?? []).filter((providerId) => !approvedProviders.includes(providerId)),
  );
  const droppedProviders = uniqueSorted(raid.synthesizedOutput?.droppedProviderIds ?? []);

  return {
    schemaVersion: "bossraid-agent-log/v1",
    generatedAt: new Date().toISOString(),
    source: {
      kind: "derived_from_raid_state",
      note:
        "This log is derived from persisted raid state, assignment timestamps, ranked submissions, settlement artifacts, and reputation events. It does not invent steps that were not recorded.",
    },
    agent: {
      id: "mercenary-v1",
      name: "Mercenary",
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
          : `/receipt?raidId=${encodeURIComponent(raid.id)}&token=${encodeURIComponent(options.raidAccessToken)}`,
    },
    task: {
      title: raid.task.taskTitle,
      description: raid.task.taskDescription,
      language: raid.task.language,
      framework: raid.task.framework,
      fileCount: raid.task.files.length,
      outputPrimaryType: raid.task.output?.primaryType ?? "patch",
      artifactTypes: raid.task.output?.artifactTypes ?? [raid.task.output?.primaryType ?? "patch"],
      constraints: {
        numExperts: raid.task.constraints.numExperts,
        maxBudgetUsd: raid.task.constraints.maxBudgetUsd,
        maxLatencySec: raid.task.constraints.maxLatencySec,
        allowExternalSearch: raid.task.constraints.allowExternalSearch,
        privacyMode: raid.task.constraints.privacyMode ?? "off",
        selectionMode:
          raid.task.constraints.selectionMode ??
          (raid.task.constraints.privacyMode && raid.task.constraints.privacyMode !== "off"
            ? "privacy_first"
            : "best_match"),
        requireSpecializations: raid.task.constraints.requireSpecializations,
        allowedModelFamilies: raid.task.constraints.allowedModelFamilies ?? [],
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
  getProvider?: (providerId: string) => ProviderProfile | undefined,
) {
  const approvedSubmissions = rootRaid.rankedSubmissions.filter((entry) => entry.breakdown.valid);
  const childSummary =
    executionRaids.length > 1
      ? `${executionRaids.length} child raids across ${uniqueSorted(executionRaids.map((raid) => raid.contributionPlan?.workstreamLabel).filter((value): value is string => Boolean(value))).length} workstreams`
      : "single raid execution";
  const selectedProviderTrust = rootRaid.selectedProviders.map((providerId) =>
    buildProviderTrustRecord(providerId, getProvider?.(providerId)),
  );
  const routingProof = buildRoutingProofLog(rootRaid, executionRaids, getProvider);

  return [
    {
      at: rootRaid.createdAt,
      type: "discover_task",
      status: "complete" as const,
      summary: `Accepted ${rootRaid.task.language} task from ${rootRaid.task.hostContext?.host ?? "unknown host"}.`,
      data: {
        fileCount: rootRaid.task.files.length,
        outputPrimaryType: rootRaid.task.output?.primaryType ?? "patch",
      },
    },
    {
      at: rootRaid.createdAt,
      type: "sanitize_and_plan",
      status: "complete" as const,
      summary: `Sanitized task input and planned ${childSummary}.`,
      data: {
        riskTier: rootRaid.task.sanitizationReport.riskTier,
        selectedProviders: rootRaid.selectedProviders,
        reserveProviders: rootRaid.reserveProviders,
        requireErc8004: rootRaid.task.constraints.requireErc8004 === true,
        minTrustScore: rootRaid.task.constraints.minTrustScore,
        allowedModelFamilies: rootRaid.task.constraints.allowedModelFamilies ?? [],
        selectedProviderTrust,
        selectedProviderRouting: routingProof?.providers ?? [],
      },
    },
    {
      at: approvedSubmissions[0]?.submission.submittedAt ?? rootRaid.updatedAt,
      type: "verify_outputs",
      status: approvedSubmissions.length ? "complete" as const : "pending" as const,
      summary: approvedSubmissions.length
        ? `Approved ${approvedSubmissions.length} provider submissions after evaluation.`
        : "No provider output approved yet.",
      data: {
        approvedProviders: approvedSubmissions.map((entry) => entry.submission.providerId),
        droppedProviders: rootRaid.synthesizedOutput?.droppedProviderIds ?? [],
      },
    },
    {
      at: rootRaid.updatedAt,
      type: "submit_result",
      status: rootRaid.status === "final" ? "complete" as const : "pending" as const,
      summary:
        rootRaid.status === "final"
          ? "Finalized the canonical multi-agent synthesis result."
          : `Raid is currently ${rootRaid.status}.`,
      data: {
        primaryProviderId: rootRaid.primarySubmissionId,
        settlementMode: rootRaid.settlementExecution?.mode,
      },
    },
  ];
}

function buildToolCallLog(rootRaid: RaidRecord, executionRaids: RaidRecord[]) {
  const toolCalls: BossRaidAgentLog["toolCalls"] = [
    {
      at: rootRaid.createdAt,
      tool: "sanitize_task",
      kind: "internal",
      status: "complete",
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
      tool: "partition_workstreams",
      kind: "internal",
      status: "complete",
      details: {
        childRaidCount: executionRaids.length,
        workstreams: uniqueSorted(
          executionRaids.map((raid) => raid.contributionPlan?.workstreamLabel).filter((value): value is string => Boolean(value)),
        ),
      },
    });
  }

  for (const raid of executionRaids) {
    for (const assignment of Object.values(raid.assignments)) {
      if (assignment.invitedAt) {
        toolCalls.push({
          at: assignment.invitedAt,
          tool: "provider_http_invite",
          kind: "http",
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
          tool: "provider_http_accept",
          kind: "http",
          status: "accepted",
          target: assignment.providerId,
          details: {
            providerRunId: assignment.providerRunId,
          },
        });
      }

      if (assignment.firstHeartbeatAt) {
        toolCalls.push({
          at: assignment.firstHeartbeatAt,
          tool: "provider_http_run",
          kind: "http",
          status: "running",
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
          tool: "evaluate_submission",
          kind: "evaluation",
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
      tool: "settle_raid",
      kind: "settlement",
      status: "complete",
      details: {
        mode: rootRaid.settlementExecution.mode,
        proofStandard: rootRaid.settlementExecution.proofStandard,
        registryAddress: rootRaid.settlementExecution.contracts.registryAddress,
        escrowAddress: rootRaid.settlementExecution.contracts.escrowAddress,
        registryRaidRef: rootRaid.settlementExecution.registryRaidRef,
        transactionHashes: rootRaid.settlementExecution.transactionHashes ?? [],
      },
    });
  }

  return toolCalls.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function buildRetryLog(executionRaids: RaidRecord[]) {
  return executionRaids
    .flatMap((raid) =>
      Object.values(raid.assignments)
        .filter((assignment) => assignment.message === "promoted from reserve")
        .map((assignment) => ({
          at: assignment.timeoutAt ?? assignment.acceptedAt ?? assignment.invitedAt ?? raid.updatedAt,
          type: "reserve_promotion",
          summary: `${assignment.providerId} was promoted from reserve for ${raid.contributionPlan?.workstreamLabel ?? raid.id}.`,
        })),
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function buildFailureLog(executionRaids: RaidRecord[]) {
  return executionRaids
    .flatMap((raid) =>
      Object.values(raid.assignments)
        .filter((assignment) => ["invalid", "timed_out", "failed", "disqualified"].includes(assignment.status))
        .map((assignment) => ({
          at: assignment.timeoutAt ?? assignment.submittedAt ?? assignment.acceptedAt ?? assignment.invitedAt ?? raid.updatedAt,
          stage: assignment.status,
          providerId: assignment.providerId,
          summary: assignment.message ?? `${assignment.providerId} ended in ${assignment.status}.`,
        })),
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function collectChildRaids(rootRaid: RaidRecord, getRaid: (raidId: string) => RaidRecord | undefined): RaidRecord[] {
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

function collectSupportedLanguages(providers: ProviderProfile[]): SupportedLanguage[] {
  return uniqueSorted(providers.flatMap((provider) => provider.supportedLanguages)) as SupportedLanguage[];
}

function readProviderPrivacyFeatures(provider: ProviderProfile): PrivacyFeatureKey[] {
  const features: PrivacyFeatureKey[] = [];
  if (provider.privacy?.teeAttested) {
    features.push("tee_attested");
  }
  if (provider.privacy?.e2ee) {
    features.push("e2ee");
  }
  if (provider.privacy?.noDataRetention) {
    features.push("no_data_retention");
  }
  if (provider.privacy?.signedOutputs) {
    features.push("signed_outputs");
  }
  if (provider.privacy?.provenanceAttested) {
    features.push("provenance_attested");
  }
  if (provider.privacy?.operatorVerified) {
    features.push("operator_verified");
  }
  return features;
}

function buildProviderTrustRecord(providerId: string, provider: ProviderProfile | undefined) {
  return {
    providerId,
    erc8004Registered: provider != null && providerHasErc8004Identity(provider),
    trustScore: provider == null ? 0 : computeTrustScore(provider),
    trustReason: provider?.trust?.reason,
    operatorWallet: provider?.erc8004?.operatorWallet,
    registrationTx: provider?.erc8004?.registrationTx,
  };
}

function buildRoutingProofLog(
  rootRaid: RaidRecord,
  executionRaids: RaidRecord[],
  getProvider?: (providerId: string) => ProviderProfile | undefined,
): BossRaidRoutingProof | undefined {
  const providers = executionRaids.flatMap((currentRaid) => {
    if (currentRaid.routingProof?.providers.length) {
      return currentRaid.routingProof.providers;
    }

    return [...currentRaid.selectedProviders, ...currentRaid.reserveProviders].map((providerId) =>
      buildFallbackRoutingDecision(providerId, currentRaid, getProvider?.(providerId)),
    );
  });

  if (providers.length === 0) {
    return undefined;
  }

  return {
    policy: rootRaid.routingProof?.policy ?? {
      privacyMode: rootRaid.task.constraints.privacyMode ?? "off",
      selectionMode:
        rootRaid.task.constraints.selectionMode ??
        (rootRaid.task.constraints.privacyMode && rootRaid.task.constraints.privacyMode !== "off"
          ? "privacy_first"
          : "best_match"),
      requireErc8004: rootRaid.task.constraints.requireErc8004 === true,
      minTrustScore: rootRaid.task.constraints.minTrustScore,
      allowedModelFamilies: rootRaid.task.constraints.allowedModelFamilies ?? [],
      requiredPrivacyFeatures: rootRaid.task.constraints.requirePrivacyFeatures ?? [],
      venicePrivateLane:
        rootRaid.task.constraints.privacyMode === "strict" ||
        (rootRaid.task.constraints.allowedModelFamilies ?? []).some((family) => family.toLowerCase().includes("venice")),
    },
    providers,
  };
}

function buildFallbackRoutingDecision(
  providerId: string,
  raid: RaidRecord,
  provider: ProviderProfile | undefined,
): BossRaidRoutingProof["providers"][number] {
  const trustRecord = buildProviderTrustRecord(providerId, provider);

  return {
    providerId,
    phase: raid.selectedProviders.includes(providerId) ? "primary" : "reserve",
    workstreamId: raid.contributionPlan?.workstreamId,
    workstreamLabel: raid.contributionPlan?.workstreamLabel,
    roleId: raid.contributionPlan?.roleId,
    roleLabel: raid.contributionPlan?.roleLabel,
    modelFamily: provider?.modelFamily,
    veniceBacked: (provider?.modelFamily ?? "").toLowerCase().includes("venice"),
    erc8004Registered: trustRecord.erc8004Registered,
    trustScore: trustRecord.trustScore,
    trustReason: trustRecord.trustReason,
    operatorWallet: trustRecord.operatorWallet,
    registrationTx: trustRecord.registrationTx,
    privacyFeatures: provider ? readProviderPrivacyFeatures(provider) : ([] as PrivacyFeatureKey[]),
    matchedSpecializations: [],
    reasons: [
      raid.selectedProviders.includes(providerId) ? "selected_primary" : "reserved_fallback",
      raid.task.constraints.privacyMode === "strict" ? "strict_privacy" : "standard_routing",
    ],
  };
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.length > 0)))].sort();
}
