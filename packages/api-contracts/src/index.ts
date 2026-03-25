import { createHash } from "node:crypto";
import type {
  AgentHeartbeatInput,
  BossRaidRequest,
  BossRaidSpawnInput,
  ChatCompletionMessage,
  ChatCompletionRequest,
  Erc8004Verification,
  FailingSignals,
  HostContext,
  OutputType,
  PrivacyFeatureKey,
  PrivacyMode,
  PrivacyRoutingMode,
  ProviderAuthConfig,
  ProviderDiscoveryQuery,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderRegistrationInput,
  ProviderStatus,
  ProviderSubmission,
  RaidConstraints,
  RewardPolicy,
  SelectionMode,
  SupportedLanguage,
  TaskFile,
} from "@bossraid/shared-types";

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(["csharp", "typescript", "python", "solidity", "text"]);
const OUTPUT_TYPES = new Set<OutputType>(["text", "json", "image", "video", "patch", "bundle"]);
const PRIVACY_ROUTING_MODES = new Set<PrivacyRoutingMode>(["off", "prefer", "strict"]);
const SELECTION_MODES = new Set<SelectionMode>(["best_match", "privacy_first", "cost_first", "diverse_mix"]);
const ERC8004_VERIFICATION_STATUSES = new Set<Erc8004Verification["status"]>([
  "not_checked",
  "verified",
  "partial",
  "failed",
  "error",
]);
const PRIVACY_FEATURES = new Set<PrivacyFeatureKey>([
  "tee_attested",
  "e2ee",
  "no_data_retention",
  "signed_outputs",
  "provenance_attested",
  "operator_verified",
]);
const HOSTS = new Set<HostContext["host"]>(["codex", "claude_code"]);
const PROVIDER_AUTH_TYPES = new Set<ProviderAuthConfig["type"]>(["bearer", "hmac", "none"]);
const PROVIDER_STATUSES = new Set<ProviderStatus>(["available", "degraded", "offline"]);
const CHAT_MESSAGE_ROLES = new Set<ChatCompletionMessage["role"]>(["system", "user", "assistant"]);

export class ApiContractError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiContractError";
    this.statusCode = statusCode;
  }
}

function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiContractError(`Expected object for ${label}.`);
  }

  return value as Record<string, unknown>;
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiContractError(`Expected non-empty string for ${label}.`);
  }

  return value;
}

function ensureOptionalString(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  return ensureString(value, label);
}

function ensureNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiContractError(`Expected finite number for ${label}.`);
  }

  return value;
}

function ensureFiniteNumberLike(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new ApiContractError(`Expected finite number for ${label}.`);
}

function ensureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiContractError(`Expected boolean for ${label}.`);
  }

  return value;
}

function ensureBooleanLike(value: unknown, label: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }

  throw new ApiContractError(`Expected boolean for ${label}.`);
}

function ensureStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ApiContractError(`Expected string array for ${label}.`);
  }

  return value;
}

function ensureOptionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value == null) {
    return undefined;
  }

  return ensureRecord(value, label);
}

function ensurePositiveIntegerLike(value: unknown, label: string): number {
  const parsed = ensureFiniteNumberLike(value, label);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiContractError(`Expected positive integer for ${label}.`);
  }

  return parsed;
}

function ensureLanguage(value: unknown, label: string): SupportedLanguage {
  const normalized = ensureString(value, label) as SupportedLanguage;
  if (!SUPPORTED_LANGUAGES.has(normalized)) {
    throw new ApiContractError(`Unsupported language for ${label}.`);
  }

  return normalized;
}

function ensureOutputType(value: unknown, label: string): OutputType {
  const normalized = ensureString(value, label) as OutputType;
  if (!OUTPUT_TYPES.has(normalized)) {
    throw new ApiContractError(`Unsupported output type for ${label}.`);
  }

  return normalized;
}

function ensureOutputTypeArray(value: unknown, label: string): OutputType[] {
  return ensureStringArray(value, label).map((item, index) => ensureOutputType(item, `${label}[${index}]`));
}

function ensurePrivacyRoutingMode(value: unknown, label: string): PrivacyRoutingMode {
  const normalized = ensureString(value, label) as PrivacyRoutingMode;
  if (!PRIVACY_ROUTING_MODES.has(normalized)) {
    throw new ApiContractError(`Unsupported privacy mode for ${label}.`);
  }

  return normalized;
}

function ensurePrivacyFeatureArray(value: unknown, label: string): PrivacyFeatureKey[] {
  return ensureStringArray(value, label).map((item, index) => ensurePrivacyFeature(item, `${label}[${index}]`));
}

function ensurePrivacyFeature(value: unknown, label: string): PrivacyFeatureKey {
  const normalized = ensureString(value, label) as PrivacyFeatureKey;
  if (!PRIVACY_FEATURES.has(normalized)) {
    throw new ApiContractError(`Unsupported privacy feature for ${label}.`);
  }

  return normalized;
}

function ensureSelectionMode(value: unknown, label: string): SelectionMode {
  const normalized = ensureString(value, label) as SelectionMode;
  if (!SELECTION_MODES.has(normalized)) {
    throw new ApiContractError(`Unsupported selection mode for ${label}.`);
  }

  return normalized;
}

function ensureTrustSource(value: unknown, label: string): "erc8004" {
  const normalized = ensureString(value, label);
  if (normalized !== "erc8004") {
    throw new ApiContractError(`Unsupported trust source for ${label}.`);
  }

  return normalized;
}

function ensureErc8004VerificationStatus(value: unknown, label: string): Erc8004Verification["status"] {
  const normalized = ensureString(value, label) as Erc8004Verification["status"];
  if (!ERC8004_VERIFICATION_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported ERC-8004 verification status for ${label}.`);
  }

  return normalized;
}

function ensureHost(value: unknown, label: string): HostContext["host"] {
  const normalized = ensureString(value, label) as HostContext["host"];
  if (!HOSTS.has(normalized)) {
    throw new ApiContractError(`Unsupported host for ${label}.`);
  }

  return normalized;
}

function ensureProviderAuthType(value: unknown, label: string): ProviderAuthConfig["type"] {
  const normalized = ensureString(value, label) as ProviderAuthConfig["type"];
  if (!PROVIDER_AUTH_TYPES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider auth type for ${label}.`);
  }

  return normalized;
}

function ensureProviderStatus(value: unknown, label: string): ProviderStatus {
  const normalized = ensureString(value, label) as ProviderStatus;
  if (!PROVIDER_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider status for ${label}.`);
  }

  return normalized;
}

function ensureChatMessageRole(value: unknown, label: string): ChatCompletionMessage["role"] {
  const normalized = ensureString(value, label) as ChatCompletionMessage["role"];
  if (!CHAT_MESSAGE_ROLES.has(normalized)) {
    throw new ApiContractError(`Unsupported chat message role for ${label}.`);
  }

  return normalized;
}

function ensureMessageArray(value: unknown, label: string): ChatCompletionMessage[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Expected array for ${label}.`);
  }
  if (value.length === 0) {
    throw new ApiContractError(`Expected non-empty array for ${label}.`);
  }

  return value.map((item, index) => {
    const message = ensureRecord(item, `${label}[${index}]`);
    return {
      role: ensureChatMessageRole(message.role, `${label}[${index}].role`),
      content: ensureString(message.content, `${label}[${index}].content`),
    };
  });
}

function parseTaskFiles(value: unknown): TaskFile[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError("Expected array for files.");
  }

  return value.map((item, index) => {
    const file = ensureRecord(item, `files[${index}]`);
    return {
      path: ensureString(file.path, `files[${index}].path`),
      content: ensureString(file.content, `files[${index}].content`),
      sha256: ensureString(file.sha256, `files[${index}].sha256`),
    };
  });
}

function parseFailingSignals(value: unknown): FailingSignals {
  const input = ensureRecord(value, "failing_signals");
  return {
    errors: ensureStringArray(input.errors, "failing_signals.errors"),
    tests: input.tests == null ? undefined : ensureStringArray(input.tests, "failing_signals.tests"),
    reproSteps:
      input.reproSteps == null && input.repro_steps == null
        ? undefined
        : ensureStringArray(input.reproSteps ?? input.repro_steps, "failing_signals.repro_steps"),
    expectedBehavior: ensureOptionalString(
      input.expectedBehavior ?? input.expected_behavior,
      "failing_signals.expected_behavior",
    ),
    observedBehavior: ensureOptionalString(
      input.observedBehavior ?? input.observed_behavior,
      "failing_signals.observed_behavior",
    ),
  };
}

function parseRaidConstraints(value: unknown): RaidConstraints {
  const input = ensureRecord(value, "constraints");
  return {
    numExperts: ensureNumber(input.numExperts ?? input.num_experts, "constraints.num_experts"),
    maxBudgetUsd: ensureNumber(input.maxBudgetUsd ?? input.max_budget_usd, "constraints.max_budget_usd"),
    maxLatencySec: ensureNumber(input.maxLatencySec ?? input.max_latency_sec, "constraints.max_latency_sec"),
    allowExternalSearch: ensureBoolean(
      input.allowExternalSearch ?? input.allow_external_search,
      "constraints.allow_external_search",
    ),
    requireSpecializations: ensureStringArray(
      input.requireSpecializations ?? input.require_specializations ?? [],
      "constraints.require_specializations",
    ),
    minReputation: ensureNumber(input.minReputation ?? input.min_reputation, "constraints.min_reputation"),
    requireErc8004:
      input.requireErc8004 == null && input.require_erc8004 == null
        ? undefined
        : ensureBooleanLike(input.requireErc8004 ?? input.require_erc8004, "constraints.require_erc8004"),
    minTrustScore:
      input.minTrustScore == null && input.min_trust_score == null
        ? undefined
        : ensureNumber(input.minTrustScore ?? input.min_trust_score, "constraints.min_trust_score"),
    maxChangedFiles:
      input.maxChangedFiles == null && input.max_changed_files == null
        ? undefined
        : ensureNumber(input.maxChangedFiles ?? input.max_changed_files, "constraints.max_changed_files"),
    maxDiffLines:
      input.maxDiffLines == null && input.max_diff_lines == null
        ? undefined
        : ensureNumber(input.maxDiffLines ?? input.max_diff_lines, "constraints.max_diff_lines"),
    forbidPaths:
      input.forbidPaths == null && input.forbid_paths == null
        ? undefined
        : ensureStringArray(input.forbidPaths ?? input.forbid_paths, "constraints.forbid_paths"),
    allowedModelFamilies:
      input.allowedModelFamilies == null && input.allowed_model_families == null
        ? undefined
        : ensureStringArray(
            input.allowedModelFamilies ?? input.allowed_model_families,
            "constraints.allowed_model_families",
          ),
    allowedOutputTypes:
      input.allowedOutputTypes == null && input.allowed_output_types == null
        ? undefined
        : ensureOutputTypeArray(
            input.allowedOutputTypes ?? input.allowed_output_types,
            "constraints.allowed_output_types",
          ),
    privacyMode:
      input.privacyMode == null && input.privacy_mode == null
        ? undefined
        : ensurePrivacyRoutingMode(input.privacyMode ?? input.privacy_mode, "constraints.privacy_mode"),
    requirePrivacyFeatures:
      input.requirePrivacyFeatures == null && input.require_privacy_features == null
        ? undefined
        : ensurePrivacyFeatureArray(
            input.requirePrivacyFeatures ?? input.require_privacy_features,
            "constraints.require_privacy_features",
          ),
    selectionMode:
      input.selectionMode == null && input.selection_mode == null
        ? undefined
        : ensureSelectionMode(input.selectionMode ?? input.selection_mode, "constraints.selection_mode"),
  };
}

function parseRewardPolicy(value: unknown): RewardPolicy {
  if (value == null) {
    return {
      splitStrategy: "equal_success_only",
    };
  }

  const input = ensureRecord(value, "reward_policy");
  const splitStrategy = input.splitStrategy ?? input.split_strategy;

  if (splitStrategy == null) {
    return {
      splitStrategy: "equal_success_only",
    };
  }

  const normalized = ensureString(splitStrategy, "reward_policy.split_strategy");
  if (normalized !== "equal_success_only") {
    throw new ApiContractError("Expected reward_policy.split_strategy to be equal_success_only.");
  }

  return {
    splitStrategy: normalized,
  };
}

function parsePrivacyMode(value: unknown): PrivacyMode {
  const input = ensureRecord(value, "privacy_mode");
  return {
    redactSecrets: ensureBoolean(input.redactSecrets ?? input.redact_secrets, "privacy_mode.redact_secrets"),
    redactIdentifiers: ensureBoolean(
      input.redactIdentifiers ?? input.redact_identifiers,
      "privacy_mode.redact_identifiers",
    ),
    allowFullRepo: ensureBoolean(input.allowFullRepo ?? input.allow_full_repo, "privacy_mode.allow_full_repo"),
  };
}

function parseHostContext(value: unknown): HostContext | undefined {
  if (value == null) {
    return undefined;
  }

  const input = ensureRecord(value, "host_context");
  return {
    host: ensureHost(input.host, "host_context.host"),
    sessionId: ensureOptionalString(input.sessionId ?? input.session_id, "host_context.session_id"),
    repoRootHint: ensureOptionalString(input.repoRootHint ?? input.repo_root_hint, "host_context.repo_root_hint"),
    branchName: ensureOptionalString(input.branchName ?? input.branch_name, "host_context.branch_name"),
  };
}

function parseProviderAuthConfig(value: unknown): ProviderAuthConfig | undefined {
  if (value == null) {
    return undefined;
  }

  const input = ensureRecord(value, "provider_auth");
  return {
    type: ensureProviderAuthType(input.type, "provider_auth.type"),
    token: ensureOptionalString(input.token, "provider_auth.token"),
    secret: ensureOptionalString(input.secret, "provider_auth.secret"),
    headerName: ensureOptionalString(input.headerName ?? input.header_name, "provider_auth.header_name"),
  };
}

function parseOutputConfig(
  value: unknown,
  label: string,
): {
  primaryType: OutputType;
  artifactTypes?: OutputType[];
} {
  const input = ensureRecord(value, label);
  return {
    primaryType: ensureOutputType(input.primaryType ?? input.primary_type, `${label}.primary_type`),
    artifactTypes:
      input.artifactTypes == null && input.artifact_types == null
        ? undefined
        : ensureOutputTypeArray(input.artifactTypes ?? input.artifact_types, `${label}.artifact_types`),
  };
}

function parseErc8004Verification(value: unknown, field: string): Erc8004Verification {
  const input = ensureRecord(value, field);

  return {
    status: ensureErc8004VerificationStatus(input.status, `${field}.status`),
    checkedAt: ensureString(input.checkedAt ?? input.checked_at, `${field}.checked_at`),
    chainId: ensureOptionalString(input.chainId ?? input.chain_id, `${field}.chain_id`),
    agentRegistry: ensureOptionalString(input.agentRegistry ?? input.agent_registry, `${field}.agent_registry`),
    owner: ensureOptionalString(input.owner, `${field}.owner`),
    agentUri: ensureOptionalString(input.agentUri ?? input.agent_uri, `${field}.agent_uri`),
    registrationTxFound:
      input.registrationTxFound == null && input.registration_tx_found == null
        ? undefined
        : ensureBooleanLike(input.registrationTxFound ?? input.registration_tx_found, `${field}.registration_tx_found`),
    operatorMatchesOwner:
      input.operatorMatchesOwner == null && input.operator_matches_owner == null
        ? undefined
        : ensureBooleanLike(input.operatorMatchesOwner ?? input.operator_matches_owner, `${field}.operator_matches_owner`),
    identityRegistryReachable:
      input.identityRegistryReachable == null && input.identity_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.identityRegistryReachable ?? input.identity_registry_reachable,
            `${field}.identity_registry_reachable`,
          ),
    reputationRegistryReachable:
      input.reputationRegistryReachable == null && input.reputation_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.reputationRegistryReachable ?? input.reputation_registry_reachable,
            `${field}.reputation_registry_reachable`,
          ),
    validationRegistryReachable:
      input.validationRegistryReachable == null && input.validation_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.validationRegistryReachable ?? input.validation_registry_reachable,
            `${field}.validation_registry_reachable`,
          ),
    notes: input.notes == null ? undefined : ensureStringArray(input.notes, `${field}.notes`),
  };
}

export function parseBossRaidSpawnInput(value: unknown): BossRaidSpawnInput {
  const input = ensureRecord(value, "spawn_input");
  return {
    taskTitle: ensureString(input.taskTitle ?? input.task_title, "task_title"),
    taskDescription: ensureString(input.taskDescription ?? input.task_description, "task_description"),
    language: ensureLanguage(input.language, "language"),
    framework: ensureOptionalString(input.framework, "framework"),
    files: parseTaskFiles(input.files),
    failingSignals: parseFailingSignals(input.failingSignals ?? input.failing_signals),
    output: input.output == null ? undefined : parseOutputConfig(input.output, "spawn_input.output"),
    constraints: parseRaidConstraints(input.constraints),
    rewardPolicy: parseRewardPolicy(input.rewardPolicy ?? input.reward_policy),
    privacyMode: parsePrivacyMode(input.privacyMode ?? input.privacy_mode),
    hostContext: parseHostContext(input.hostContext ?? input.host_context),
  };
}

export function parseBossRaidRequest(value: unknown): BossRaidSpawnInput {
  const input = ensureRecord(value, "raid_request");
  const task = ensureRecord(input.task, "task");
  const raidPolicy = input.raidPolicy == null ? {} : ensureRecord(input.raidPolicy, "raid_policy");
  const maxTotalCost = ensureFiniteNumberLike(
    raidPolicy.maxTotalCost ?? raidPolicy.max_total_cost,
    "raid_policy.max_total_cost",
  );

  return {
    taskTitle: ensureString(task.title, "task.title"),
    taskDescription: ensureString(task.description, "task.description"),
    language: ensureLanguage(task.language, "task.language"),
    framework: ensureOptionalString(task.framework, "task.framework"),
    files: parseTaskFiles(task.files),
    failingSignals:
      task.failingSignals == null && task.failing_signals == null
        ? { errors: [] }
        : parseFailingSignals(task.failingSignals ?? task.failing_signals),
    output:
      input.output == null
        ? {
            primaryType: "patch",
            artifactTypes: ["patch", "text"],
          }
        : parseOutputConfig(input.output, "raid_request.output"),
    constraints: {
      numExperts:
        typeof raidPolicy.maxAgents === "number"
          ? raidPolicy.maxAgents
          : typeof raidPolicy.max_agents === "number"
            ? (raidPolicy.max_agents as number)
            : 3,
      maxBudgetUsd: maxTotalCost,
      maxLatencySec: 60,
      allowExternalSearch: false,
      requireSpecializations:
        raidPolicy.requiredCapabilities == null && raidPolicy.required_capabilities == null
          ? []
          : ensureStringArray(
              raidPolicy.requiredCapabilities ?? raidPolicy.required_capabilities,
              "raid_policy.required_capabilities",
            ),
      minReputation:
        typeof raidPolicy.minReputationScore === "number"
          ? raidPolicy.minReputationScore / 100
          : typeof raidPolicy.min_reputation_score === "number"
            ? (raidPolicy.min_reputation_score as number) / 100
            : 0,
      requireErc8004:
        raidPolicy.requireErc8004 == null && raidPolicy.require_erc8004 == null
          ? undefined
          : ensureBooleanLike(
              raidPolicy.requireErc8004 ?? raidPolicy.require_erc8004,
              "raid_policy.require_erc8004",
            ),
      minTrustScore:
        raidPolicy.minTrustScore == null && raidPolicy.min_trust_score == null
          ? undefined
          : ensureFiniteNumberLike(
              raidPolicy.minTrustScore ?? raidPolicy.min_trust_score,
              "raid_policy.min_trust_score",
            ),
      allowedModelFamilies:
        raidPolicy.allowedModelFamilies == null && raidPolicy.allowed_model_families == null
          ? undefined
          : ensureStringArray(
              raidPolicy.allowedModelFamilies ?? raidPolicy.allowed_model_families,
              "raid_policy.allowed_model_families",
            ),
      allowedOutputTypes:
        raidPolicy.allowedOutputTypes == null && raidPolicy.allowed_output_types == null
          ? undefined
          : ensureOutputTypeArray(
              raidPolicy.allowedOutputTypes ?? raidPolicy.allowed_output_types,
              "raid_policy.allowed_output_types",
            ),
      privacyMode:
        raidPolicy.privacyMode == null && raidPolicy.privacy_mode == null
          ? undefined
          : ensurePrivacyRoutingMode(
              raidPolicy.privacyMode ?? raidPolicy.privacy_mode,
              "raid_policy.privacy_mode",
            ),
      requirePrivacyFeatures:
        raidPolicy.requirePrivacyFeatures == null && raidPolicy.require_privacy_features == null
          ? undefined
          : ensurePrivacyFeatureArray(
              raidPolicy.requirePrivacyFeatures ?? raidPolicy.require_privacy_features,
              "raid_policy.require_privacy_features",
            ),
      selectionMode:
        raidPolicy.selectionMode == null && raidPolicy.selection_mode == null
          ? undefined
          : ensureSelectionMode(
              raidPolicy.selectionMode ?? raidPolicy.selection_mode,
              "raid_policy.selection_mode",
            ),
    },
    rewardPolicy: {
      splitStrategy: "equal_success_only",
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: parseHostContext(input.hostContext ?? input.host_context),
  };
}

export function parseChatCompletionRequest(value: unknown): ChatCompletionRequest {
  const input = ensureRecord(value, "chat_completion_request");
  return {
    model: ensureString(input.model, "chat_completion_request.model") as ChatCompletionRequest["model"],
    messages: ensureMessageArray(input.messages, "chat_completion_request.messages"),
    stream:
      input.stream == null
        ? undefined
        : ensureBooleanLike(input.stream, "chat_completion_request.stream"),
    user: ensureOptionalString(input.user, "chat_completion_request.user"),
    raidRequest:
      input.raidRequest == null && input.raid_request == null
        ? undefined
        : parseBossRaidRequest(input.raidRequest ?? input.raid_request),
    raidPolicy:
      input.raidPolicy == null && input.raid_policy == null
        ? undefined
        : (ensureRecord(
            input.raidPolicy ?? input.raid_policy,
            "chat_completion_request.raid_policy",
          ) as ChatCompletionRequest["raidPolicy"]),
  };
}

export function buildBossRaidRequestFromChatCompletion(
  input: ChatCompletionRequest,
  options?: {
    defaultMaxTotalCost?: number;
  },
): BossRaidRequest {
  const trimmedMessages = input.messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
  const userMessages = trimmedMessages.filter((message) => message.role === "user").map((message) => message.content);
  const primaryPrompt =
    userMessages[userMessages.length - 1] ??
    trimmedMessages[trimmedMessages.length - 1]?.content ??
    "Chat completion request";
  const title = primaryPrompt.slice(0, 80);
  const rawRaidPolicy = ensureOptionalRecord(input.raidPolicy, "chat_completion_request.raid_policy");
  const maxAgentsValue = rawRaidPolicy?.maxAgents ?? rawRaidPolicy?.max_agents;
  const maxAgents = maxAgentsValue == null ? 2 : ensurePositiveIntegerLike(maxAgentsValue, "chat_completion_request.raid_policy.max_agents");
  const maxTotalCostValue =
    rawRaidPolicy?.maxTotalCost ?? rawRaidPolicy?.max_total_cost ?? options?.defaultMaxTotalCost;
  const maxTotalCost = ensureFiniteNumberLike(
    maxTotalCostValue,
    "chat_completion_request.raid_policy.max_total_cost",
  );
  const requiredCapabilitiesValue =
    rawRaidPolicy?.requiredCapabilities ?? rawRaidPolicy?.required_capabilities;
  const requiredCapabilities =
    requiredCapabilitiesValue == null
      ? undefined
      : ensureStringArray(requiredCapabilitiesValue, "chat_completion_request.raid_policy.required_capabilities");

  return {
    agent: "mercenary-v1",
    taskType: "analysis",
    task: {
      title: title || "Chat completion request",
      description:
        trimmedMessages
          .map((message) => `${formatChatRoleLabel(message.role)}:\n${message.content}`)
          .join("\n\n") || primaryPrompt,
      language: "text",
      files: [],
      failingSignals: {
        errors: [],
        expectedBehavior: primaryPrompt,
      },
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "json"],
    },
    raidPolicy: {
      maxAgents,
      maxTotalCost,
      requiredCapabilities,
      minReputationScore:
        rawRaidPolicy?.minReputationScore == null && rawRaidPolicy?.min_reputation_score == null
          ? undefined
          : ensureFiniteNumberLike(
              rawRaidPolicy?.minReputationScore ?? rawRaidPolicy?.min_reputation_score,
              "chat_completion_request.raid_policy.min_reputation_score",
            ),
      requireErc8004:
        rawRaidPolicy?.requireErc8004 == null && rawRaidPolicy?.require_erc8004 == null
          ? undefined
          : ensureBooleanLike(
              rawRaidPolicy?.requireErc8004 ?? rawRaidPolicy?.require_erc8004,
              "chat_completion_request.raid_policy.require_erc8004",
            ),
      minTrustScore:
        rawRaidPolicy?.minTrustScore == null && rawRaidPolicy?.min_trust_score == null
          ? undefined
          : ensureFiniteNumberLike(
              rawRaidPolicy?.minTrustScore ?? rawRaidPolicy?.min_trust_score,
              "chat_completion_request.raid_policy.min_trust_score",
            ),
      allowedModelFamilies:
        rawRaidPolicy?.allowedModelFamilies == null && rawRaidPolicy?.allowed_model_families == null
          ? undefined
          : ensureStringArray(
              rawRaidPolicy?.allowedModelFamilies ?? rawRaidPolicy?.allowed_model_families,
              "chat_completion_request.raid_policy.allowed_model_families",
            ),
      allowedOutputTypes: ["text", "json"],
      privacyMode:
        rawRaidPolicy?.privacyMode == null && rawRaidPolicy?.privacy_mode == null
          ? "prefer"
          : ensurePrivacyRoutingMode(
              rawRaidPolicy?.privacyMode ?? rawRaidPolicy?.privacy_mode,
              "chat_completion_request.raid_policy.privacy_mode",
            ),
      requirePrivacyFeatures:
        rawRaidPolicy?.requirePrivacyFeatures == null && rawRaidPolicy?.require_privacy_features == null
          ? undefined
          : ensurePrivacyFeatureArray(
              rawRaidPolicy?.requirePrivacyFeatures ?? rawRaidPolicy?.require_privacy_features,
              "chat_completion_request.raid_policy.require_privacy_features",
            ),
      selectionMode:
        rawRaidPolicy?.selectionMode == null && rawRaidPolicy?.selection_mode == null
          ? "best_match"
          : ensureSelectionMode(
              rawRaidPolicy?.selectionMode ?? rawRaidPolicy?.selection_mode,
              "chat_completion_request.raid_policy.selection_mode",
            ),
    },
    hostContext: {
      host: "codex",
    },
  };
}

function formatChatRoleLabel(role: ChatCompletionMessage["role"]): string {
  switch (role) {
    case "system":
      return "System";
    case "assistant":
      return "Assistant";
    case "user":
    default:
      return "User";
  }
}

export function buildBossRaidRequestFromDelegateInput(
  value: unknown,
): BossRaidRequest {
  const args = ensureRecord(value, "delegate_input");
  const prompt = ensureString(args.prompt, "prompt").trim();
  const system = ensureOptionalString(args.system, "system");
  const title =
    ensureOptionalString(args.title, "title") ??
    ensureOptionalString(args.taskTitle ?? args.task_title, "task_title") ??
    prompt
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) ??
    "Boss Raid task";
  const files = normalizeDelegateTaskFiles(args.files);
  const language = normalizeDelegateLanguage(args.language, files);
  const output = normalizeDelegateOutput(args.output, files.length > 0);
  const taskType =
    ensureOptionalString(args.taskType ?? args.task_type, "task_type") ??
    inferDelegateTaskType(output.primaryType, files.length > 0);

  return {
    agent: "mercenary-v1",
    taskType,
    task: {
      title,
      description:
        ensureOptionalString(args.description, "description") ??
        [system, prompt].filter(Boolean).join("\n\n"),
      language,
      framework: ensureOptionalString(args.framework, "framework"),
      files,
      failingSignals: normalizeDelegateFailingSignals(args),
    },
    output,
    raidPolicy: normalizeDelegateRaidPolicy(args),
    hostContext: normalizeDelegateHostContext(args),
  };
}

export function parseProviderHeartbeat(value: unknown, providerId: string): ProviderHeartbeat {
  const input = ensureRecord(value, "provider_heartbeat");
  return {
    raidId: ensureString(input.raidId, "provider_heartbeat.raidId"),
    providerId,
    providerRunId: ensureString(input.providerRunId, "provider_heartbeat.providerRunId"),
    progress: ensureNumber(input.progress, "provider_heartbeat.progress"),
    message: ensureOptionalString(input.message, "provider_heartbeat.message"),
    timestamp: ensureOptionalString(input.timestamp, "provider_heartbeat.timestamp") ?? new Date().toISOString(),
  };
}

function normalizeDelegateTaskFiles(value: unknown): TaskFile[] {
  if (value == null) {
    return [];
  }

  return normalizeDelegateTaskFilesFromArray(value);
}

function normalizeDelegateLanguage(value: unknown, files: TaskFile[]): SupportedLanguage {
  if (value != null) {
    return ensureLanguage(value, "language");
  }

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith(".py")) {
      return "python";
    }
    if (lower.endsWith(".sol")) {
      return "solidity";
    }
    if (lower.endsWith(".cs")) {
      return "csharp";
    }
    if (
      lower.endsWith(".ts") ||
      lower.endsWith(".tsx") ||
      lower.endsWith(".js") ||
      lower.endsWith(".jsx")
    ) {
      return "typescript";
    }
  }

  return "text";
}

function inferDelegateTaskType(primaryType: OutputType, hasFiles: boolean): string {
  if (primaryType === "patch" || hasFiles) {
    return "code_task";
  }

  return "analysis";
}

function normalizeDelegateOutput(
  value: unknown,
  hasFiles: boolean,
): NonNullable<BossRaidRequest["output"]> {
  const input = ensureOptionalRecord(value, "output");
  const primarySource = input?.primaryType ?? input?.primary_type;
  const primaryType =
    primarySource == null
      ? (hasFiles ? "patch" : "text")
      : ensureOutputType(primarySource, "output.primary_type");
  const artifactSource = input?.artifactTypes ?? input?.artifact_types;
  const artifactTypes: OutputType[] =
    artifactSource == null
      ? (primaryType === "patch" ? ["patch", "text"] : ["text", "json"])
      : ensureOutputTypeArray(artifactSource, "output.artifact_types");

  return {
    primaryType,
    artifactTypes,
  };
}

function normalizeDelegateFailingSignals(args: Record<string, unknown>): FailingSignals {
  const input = ensureOptionalRecord(args.failingSignals ?? args.failing_signals, "failing_signals");
  const errorsSource = input?.errors ?? args.errors;
  const testsSource = input?.tests ?? args.tests;
  const reproStepsSource = input?.reproSteps ?? input?.repro_steps ?? args.reproSteps ?? args.repro_steps;

  return {
    errors: errorsSource == null ? [] : ensureStringArray(errorsSource, "failingSignals.errors"),
    tests: testsSource == null ? undefined : ensureStringArray(testsSource, "failingSignals.tests"),
    reproSteps:
      reproStepsSource == null
        ? undefined
        : ensureStringArray(reproStepsSource, "failingSignals.reproSteps"),
    expectedBehavior: ensureOptionalString(
      input?.expectedBehavior ?? input?.expected_behavior ?? args.expectedBehavior ?? args.expected_behavior,
      "failingSignals.expectedBehavior",
    ),
    observedBehavior: ensureOptionalString(
      input?.observedBehavior ?? input?.observed_behavior ?? args.observedBehavior ?? args.observed_behavior,
      "failingSignals.observedBehavior",
    ),
  };
}

function normalizeDelegateRaidPolicy(
  args: Record<string, unknown>,
): BossRaidRequest["raidPolicy"] | undefined {
  const input = ensureOptionalRecord(args.raidPolicy ?? args.raid_policy, "raid_policy");
  const maxAgentsSource = args.maxAgents ?? args.max_agents ?? input?.maxAgents ?? input?.max_agents;
  const maxTotalCostSource = args.maxTotalCost ?? args.max_total_cost ?? input?.maxTotalCost ?? input?.max_total_cost;
  const requiredCapabilitiesSource =
    args.requiredCapabilities ??
    args.required_capabilities ??
    input?.requiredCapabilities ??
    input?.required_capabilities;
  const minReputationScoreSource =
    args.minReputationScore ?? args.min_reputation_score ?? input?.minReputationScore ?? input?.min_reputation_score;
  const requireErc8004Source =
    args.requireErc8004 ?? args.require_erc8004 ?? input?.requireErc8004 ?? input?.require_erc8004;
  const minTrustScoreSource =
    args.minTrustScore ?? args.min_trust_score ?? input?.minTrustScore ?? input?.min_trust_score;
  const allowedModelFamiliesSource =
    args.allowedModelFamilies ?? args.allowed_model_families ?? input?.allowedModelFamilies ?? input?.allowed_model_families;
  const allowedOutputTypesSource =
    args.allowedOutputTypes ?? args.allowed_output_types ?? input?.allowedOutputTypes ?? input?.allowed_output_types;
  const privacyModeSource = args.privacyMode ?? args.privacy_mode ?? input?.privacyMode ?? input?.privacy_mode;
  const requirePrivacyFeaturesSource =
    args.requirePrivacyFeatures ??
    args.require_privacy_features ??
    input?.requirePrivacyFeatures ??
    input?.require_privacy_features;
  const selectionModeSource =
    args.selectionMode ?? args.selection_mode ?? input?.selectionMode ?? input?.selection_mode;
  const maxTotalCost = ensureFiniteNumberLike(maxTotalCostSource, "raidPolicy.maxTotalCost");

  const result = {
    maxAgents:
      maxAgentsSource == null ? undefined : ensurePositiveIntegerLike(maxAgentsSource, "raidPolicy.maxAgents"),
    maxTotalCost,
    requiredCapabilities:
      requiredCapabilitiesSource == null
        ? undefined
        : ensureStringArray(requiredCapabilitiesSource, "raidPolicy.requiredCapabilities"),
    minReputationScore:
      minReputationScoreSource == null
        ? undefined
        : ensureFiniteNumberLike(minReputationScoreSource, "raidPolicy.minReputationScore"),
    requireErc8004:
      requireErc8004Source == null
        ? undefined
        : ensureBooleanLike(requireErc8004Source, "raidPolicy.requireErc8004"),
    minTrustScore:
      minTrustScoreSource == null
        ? undefined
        : ensureFiniteNumberLike(minTrustScoreSource, "raidPolicy.minTrustScore"),
    allowedModelFamilies:
      allowedModelFamiliesSource == null
        ? undefined
        : ensureStringArray(allowedModelFamiliesSource, "raidPolicy.allowedModelFamilies"),
    allowedOutputTypes:
      allowedOutputTypesSource == null
        ? undefined
        : ensureOutputTypeArray(allowedOutputTypesSource, "raidPolicy.allowedOutputTypes"),
    privacyMode:
      privacyModeSource == null
        ? undefined
        : ensurePrivacyRoutingMode(privacyModeSource, "raidPolicy.privacyMode"),
    requirePrivacyFeatures:
      requirePrivacyFeaturesSource == null
        ? undefined
        : ensurePrivacyFeatureArray(
            requirePrivacyFeaturesSource,
            "raidPolicy.requirePrivacyFeatures",
          ),
    selectionMode:
      selectionModeSource == null
        ? undefined
        : ensureSelectionMode(selectionModeSource, "raidPolicy.selectionMode"),
  };

  return Object.values(result).some((item) => item !== undefined) ? result : undefined;
}

function normalizeDelegateHostContext(args: Record<string, unknown>): HostContext {
  const input = ensureOptionalRecord(args.hostContext ?? args.host_context, "host_context");
  const hostSource = args.host ?? input?.host;

  return {
    host: hostSource == null ? "codex" : ensureHost(hostSource, "hostContext.host"),
    sessionId: ensureOptionalString(
      args.sessionId ?? args.session_id ?? input?.sessionId ?? input?.session_id,
      "hostContext.sessionId",
    ),
    repoRootHint: ensureOptionalString(
      args.repoRootHint ?? args.repo_root_hint ?? input?.repoRootHint ?? input?.repo_root_hint,
      "hostContext.repoRootHint",
    ),
    branchName: ensureOptionalString(
      args.branchName ?? args.branch_name ?? input?.branchName ?? input?.branch_name,
      "hostContext.branchName",
    ),
  };
}

function normalizeDelegateTaskFilesFromArray(value: unknown): TaskFile[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError("Expected array for files.");
  }

  return value.map((item, index) => {
    const file = ensureRecord(item, `files[${index}]`);
    const content = ensureString(file.content, `files[${index}].content`);
    return {
      path: ensureString(file.path, `files[${index}].path`),
      content,
      sha256: ensureOptionalString(file.sha256, `files[${index}].sha256`) ?? sha256Hex(content),
    };
  });
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseProviderSubmission(value: unknown, providerId: string): ProviderSubmission {
  const input = ensureRecord(value, "provider_submission");
  const patchUnifiedDiff =
    input.patchUnifiedDiff == null && input.patch_unified_diff == null
      ? undefined
      : ensureString(input.patchUnifiedDiff ?? input.patch_unified_diff, "provider_submission.patchUnifiedDiff");
  const answerText =
    input.answerText == null && input.answer_text == null
      ? undefined
      : ensureString(input.answerText ?? input.answer_text, "provider_submission.answerText");
  const artifacts =
    input.artifacts == null
      ? undefined
      : parseSubmissionArtifacts(input.artifacts, "provider_submission.artifacts");

  if (!patchUnifiedDiff && !answerText && (!artifacts || artifacts.length === 0)) {
    throw new ApiContractError("Expected patchUnifiedDiff, answerText, or artifacts for provider_submission.");
  }

  return {
    raidId: ensureString(input.raidId, "provider_submission.raidId"),
    providerId,
    providerRunId: ensureOptionalString(
      input.providerRunId ?? input.provider_run_id,
      "provider_submission.providerRunId",
    ),
    patchUnifiedDiff,
    answerText,
    artifacts,
    explanation: ensureString(input.explanation, "provider_submission.explanation"),
    confidence: ensureNumber(input.confidence, "provider_submission.confidence"),
    claimedRootCause: ensureOptionalString(
      input.claimedRootCause ?? input.claimed_root_cause,
      "provider_submission.claimedRootCause",
    ),
    contributionRole:
      input.contributionRole == null && input.contribution_role == null
        ? undefined
        : parseContributionRole(
            input.contributionRole ?? input.contribution_role,
            "provider_submission.contributionRole",
          ),
    filesTouched:
      input.filesTouched == null && input.files_touched == null
        ? []
        : ensureStringArray(input.filesTouched ?? input.files_touched, "provider_submission.filesTouched"),
    submittedAt:
      ensureOptionalString(input.submittedAt ?? input.submitted_at, "provider_submission.submittedAt") ??
      new Date().toISOString(),
  };
}

function parseSubmissionArtifacts(
  value: unknown,
  field: string,
): NonNullable<ProviderSubmission["artifacts"]> {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Expected array for ${field}.`);
  }

  return value.map((item, index) => {
    const input = ensureRecord(item, `${field}[${index}]`);
    return {
      outputType: ensureOutputType(
        input.outputType ?? input.output_type,
        `${field}[${index}].outputType`,
      ),
      label: ensureString(input.label, `${field}[${index}].label`),
      uri: ensureString(input.uri, `${field}[${index}].uri`),
      mimeType: ensureOptionalString(
        input.mimeType ?? input.mime_type,
        `${field}[${index}].mimeType`,
      ),
      description: ensureOptionalString(
        input.description,
        `${field}[${index}].description`,
      ),
      sha256: ensureOptionalString(
        input.sha256,
        `${field}[${index}].sha256`,
      ),
    };
  });
}

function parseContributionRole(
  value: unknown,
  field: string,
): NonNullable<ProviderSubmission["contributionRole"]> {
  const input = ensureRecord(value, field);

  return {
    id: ensureString(input.id, `${field}.id`),
    label: ensureString(input.label, `${field}.label`),
    objective: ensureOptionalString(input.objective, `${field}.objective`),
    workstreamId: ensureOptionalString(
      input.workstreamId ?? input.workstream_id,
      `${field}.workstreamId`,
    ),
    workstreamLabel: ensureOptionalString(
      input.workstreamLabel ?? input.workstream_label,
      `${field}.workstreamLabel`,
    ),
    workstreamObjective: ensureOptionalString(
      input.workstreamObjective ?? input.workstream_objective,
      `${field}.workstreamObjective`,
    ),
  };
}

export function parseProviderFailure(value: unknown, providerId: string): ProviderFailure {
  const input = ensureRecord(value, "provider_failure");
  return {
    raidId: ensureString(input.raidId, "provider_failure.raidId"),
    providerId,
    providerRunId: ensureOptionalString(input.providerRunId, "provider_failure.providerRunId"),
    message: ensureString(input.message, "provider_failure.message"),
    failedAt: ensureOptionalString(input.failedAt, "provider_failure.failedAt") ?? new Date().toISOString(),
  };
}

export function parseProviderRegistrationInput(value: unknown): ProviderRegistrationInput {
  const input = ensureRecord(value, "provider_registration");
  const pricing =
    input.pricing == null ? undefined : ensureRecord(input.pricing, "provider_registration.pricing");
  const reputation =
    input.reputation == null ? undefined : ensureRecord(input.reputation, "provider_registration.reputation");
  const erc8004 =
    input.erc8004 == null ? undefined : ensureRecord(input.erc8004, "provider_registration.erc8004");
  const trust =
    input.trust == null ? undefined : ensureRecord(input.trust, "provider_registration.trust");

  return {
    agentId: ensureString(input.agentId ?? input.agent_id, "provider_registration.agent_id"),
    name: ensureString(input.name, "provider_registration.name"),
    description: ensureOptionalString(input.description, "provider_registration.description"),
    endpoint: ensureString(input.endpoint, "provider_registration.endpoint"),
    capabilities:
      input.capabilities == null ? undefined : ensureStringArray(input.capabilities, "provider_registration.capabilities"),
    supportedLanguages:
      input.supportedLanguages == null && input.supported_languages == null
        ? undefined
        : ensureStringArray(
            input.supportedLanguages ?? input.supported_languages,
            "provider_registration.supported_languages",
          ).map((item, index) =>
            ensureLanguage(item, `provider_registration.supported_languages[${index}]`),
          ),
    supportedFrameworks:
      input.supportedFrameworks == null && input.supported_frameworks == null
        ? undefined
        : ensureStringArray(
            input.supportedFrameworks ?? input.supported_frameworks,
            "provider_registration.supported_frameworks",
          ),
    outputTypes:
      input.outputTypes == null && input.output_types == null
        ? undefined
        : ensureOutputTypeArray(input.outputTypes ?? input.output_types, "provider_registration.output_types"),
    modelFamily: ensureOptionalString(
      input.modelFamily ?? input.model_family,
      "provider_registration.model_family",
    ),
    privacy:
      input.privacy == null
        ? undefined
        : {
            score:
              typeof ensureRecord(input.privacy, "provider_registration.privacy").score === "number"
                ? (ensureRecord(input.privacy, "provider_registration.privacy").score as number)
                : undefined,
            teeAttested:
              ensureRecord(input.privacy, "provider_registration.privacy").teeAttested === true ||
              ensureRecord(input.privacy, "provider_registration.privacy").tee_attested === true,
            teeVendor: ensureOptionalString(
              ensureRecord(input.privacy, "provider_registration.privacy").teeVendor ??
                ensureRecord(input.privacy, "provider_registration.privacy").tee_vendor,
              "provider_registration.privacy.tee_vendor",
            ),
            e2ee: ensureRecord(input.privacy, "provider_registration.privacy").e2ee === true,
            noDataRetention:
              ensureRecord(input.privacy, "provider_registration.privacy").noDataRetention === true ||
              ensureRecord(input.privacy, "provider_registration.privacy").no_data_retention === true,
            signedOutputs:
              ensureRecord(input.privacy, "provider_registration.privacy").signedOutputs === true ||
              ensureRecord(input.privacy, "provider_registration.privacy").signed_outputs === true,
            provenanceAttested:
              ensureRecord(input.privacy, "provider_registration.privacy").provenanceAttested === true ||
              ensureRecord(input.privacy, "provider_registration.privacy").provenance_attested === true,
            operatorVerified:
              ensureRecord(input.privacy, "provider_registration.privacy").operatorVerified === true ||
              ensureRecord(input.privacy, "provider_registration.privacy").operator_verified === true,
          },
    erc8004:
      erc8004 == null
        ? undefined
        : {
            agentId: ensureString(erc8004.agentId ?? erc8004.agent_id, "provider_registration.erc8004.agent_id"),
            operatorWallet: ensureOptionalString(
              erc8004.operatorWallet ?? erc8004.operator_wallet,
              "provider_registration.erc8004.operator_wallet",
            ),
            registrationTx: ensureOptionalString(
              erc8004.registrationTx ?? erc8004.registration_tx,
              "provider_registration.erc8004.registration_tx",
            ),
            identityRegistry: ensureOptionalString(
              erc8004.identityRegistry ?? erc8004.identity_registry,
              "provider_registration.erc8004.identity_registry",
            ),
            reputationRegistry: ensureOptionalString(
              erc8004.reputationRegistry ?? erc8004.reputation_registry,
              "provider_registration.erc8004.reputation_registry",
            ),
            validationRegistry: ensureOptionalString(
              erc8004.validationRegistry ?? erc8004.validation_registry,
              "provider_registration.erc8004.validation_registry",
            ),
            validationTxs:
              erc8004.validationTxs == null && erc8004.validation_txs == null
                ? undefined
                : ensureStringArray(
                    erc8004.validationTxs ?? erc8004.validation_txs,
                    "provider_registration.erc8004.validation_txs",
                  ),
            lastVerifiedAt: ensureOptionalString(
              erc8004.lastVerifiedAt ?? erc8004.last_verified_at,
              "provider_registration.erc8004.last_verified_at",
            ),
            verification:
              erc8004.verification == null
                ? undefined
                : parseErc8004Verification(
                    erc8004.verification,
                    "provider_registration.erc8004.verification",
                  ),
          },
    trust:
      trust == null
        ? undefined
        : {
            score:
              trust.score == null ? undefined : ensureNumber(trust.score, "provider_registration.trust.score"),
            reason: ensureOptionalString(trust.reason, "provider_registration.trust.reason"),
            source:
              trust.source == null
                ? undefined
                : ensureTrustSource(trust.source, "provider_registration.trust.source"),
          },
    pricing: pricing
      ? {
          pricePerTaskUsd:
            pricing.pricePerTaskUsd == null && pricing.price_per_task_usd == null
              ? undefined
              : ensureNumber(pricing.pricePerTaskUsd ?? pricing.price_per_task_usd, "pricing.price_per_task_usd"),
        }
      : undefined,
    auth: parseProviderAuthConfig(input.auth),
    reputation: reputation
      ? {
          globalScore:
            reputation.globalScore == null ? undefined : ensureNumber(reputation.globalScore, "reputation.globalScore"),
          responsivenessScore:
            reputation.responsivenessScore == null
              ? undefined
              : ensureNumber(reputation.responsivenessScore, "reputation.responsivenessScore"),
          validityScore:
            reputation.validityScore == null
              ? undefined
              : ensureNumber(reputation.validityScore, "reputation.validityScore"),
          qualityScore:
            reputation.qualityScore == null ? undefined : ensureNumber(reputation.qualityScore, "reputation.qualityScore"),
          timeoutRate:
            reputation.timeoutRate == null ? undefined : ensureNumber(reputation.timeoutRate, "reputation.timeoutRate"),
          duplicateRate:
            reputation.duplicateRate == null
              ? undefined
              : ensureNumber(reputation.duplicateRate, "reputation.duplicateRate"),
          specializationScores:
            reputation.specializationScores == null
              ? undefined
              : (ensureRecord(reputation.specializationScores, "reputation.specializationScores") as Record<string, number>),
          p50LatencyMs:
            reputation.p50LatencyMs == null ? undefined : ensureNumber(reputation.p50LatencyMs, "reputation.p50LatencyMs"),
          p95LatencyMs:
            reputation.p95LatencyMs == null ? undefined : ensureNumber(reputation.p95LatencyMs, "reputation.p95LatencyMs"),
          totalRaids:
            reputation.totalRaids == null ? undefined : ensureNumber(reputation.totalRaids, "reputation.totalRaids"),
          totalSuccessfulRaids:
            reputation.totalSuccessfulRaids == null
              ? undefined
              : ensureNumber(reputation.totalSuccessfulRaids, "reputation.totalSuccessfulRaids"),
        }
      : undefined,
  };
}

export function parseAgentHeartbeatInput(value: unknown): AgentHeartbeatInput {
  const input = ensureRecord(value, "agent_heartbeat");
  return {
    agentId: ensureString(input.agentId ?? input.agent_id, "agent_heartbeat.agent_id"),
    status: input.status == null ? undefined : ensureProviderStatus(input.status, "agent_heartbeat.status"),
    timestamp: ensureOptionalString(input.timestamp, "agent_heartbeat.timestamp") ?? new Date().toISOString(),
  };
}

export function parseProviderDiscoveryQuery(value: unknown): ProviderDiscoveryQuery {
  if (value == null) {
    return {};
  }

  const input = ensureRecord(value, "provider_discovery_query");
  return {
    capabilities:
      input.capabilities == null
        ? undefined
        : String(input.capabilities)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    allowedModelFamilies:
      input.allowedModelFamilies == null && input.allowed_model_families == null
        ? undefined
        : String(input.allowedModelFamilies ?? input.allowed_model_families)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    allowedOutputTypes:
      input.allowedOutputTypes == null && input.allowed_output_types == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedOutputTypes ?? input.allowed_output_types).map((item, index) =>
            ensureOutputType(item, `provider_discovery_query.allowed_output_types[${index}]`),
          ),
    privacyMode:
      input.privacyMode == null && input.privacy_mode == null
        ? undefined
        : ensurePrivacyRoutingMode(input.privacyMode ?? input.privacy_mode, "provider_discovery_query.privacy_mode"),
    requirePrivacyFeatures:
      input.requirePrivacyFeatures == null && input.require_privacy_features == null
        ? undefined
        : splitCommaSeparatedStrings(input.requirePrivacyFeatures ?? input.require_privacy_features).map((item, index) =>
            ensurePrivacyFeature(item, `provider_discovery_query.require_privacy_features[${index}]`),
          ),
    requireErc8004:
      input.requireErc8004 == null && input.require_erc8004 == null
        ? undefined
        : ensureBooleanLike(input.requireErc8004 ?? input.require_erc8004, "provider_discovery_query.require_erc8004"),
    minTrustScore:
      input.minTrustScore == null && input.min_trust_score == null
        ? undefined
        : ensureNumber(
            Number(input.minTrustScore ?? input.min_trust_score),
            "provider_discovery_query.min_trust_score",
          ),
    minReputationScore:
      input.minReputationScore == null && input.min_reputation_score == null
        ? undefined
        : ensureNumber(
            Number(input.minReputationScore ?? input.min_reputation_score),
            "provider_discovery_query.min_reputation_score",
          ),
    onlineOnly:
      input.onlineOnly == null && input.online_only == null
        ? undefined
        : ensureBooleanLike(input.onlineOnly ?? input.online_only, "provider_discovery_query.online_only"),
    maxHeartbeatAgeMs:
      input.maxHeartbeatAgeMs == null && input.max_heartbeat_age_ms == null
        ? undefined
        : ensureNumber(
          Number(input.maxHeartbeatAgeMs ?? input.max_heartbeat_age_ms),
          "provider_discovery_query.max_heartbeat_age_ms",
        ),
  };
}

function splitCommaSeparatedStrings(value: unknown): string[] {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
