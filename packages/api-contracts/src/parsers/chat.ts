import type {
  BossRaidRequest,
  ChatCompletionMessage,
  ChatCompletionRequest,
} from '@bossraid/shared-types';
import {
  ensureAgentFrameworkArray,
  ensureBooleanLike,
  ensureFiniteNumberLike,
  ensureMessageArray,
  ensureOptionalRecord,
  ensureOptionalString,
  ensurePositiveIntegerLike,
  ensurePrivacyFeatureArray,
  ensurePrivacyRoutingMode,
  ensureProviderVerificationStatus,
  ensureRecord,
  ensureSelectionMode,
  ensureString,
  ensureStringArray,
} from '../validation.js';
import { parseBossRaidRequest } from './raid.js';
import type { ChatReasoningEffort } from '@bossraid/shared-types';

const REASONING_EFFORTS = new Set<ChatReasoningEffort>(['low', 'medium', 'high', 'xhigh']);

function parseReasoningEffort(value: unknown, field: string): ChatReasoningEffort | undefined {
  if (value == null) {
    return undefined;
  }
  const raw = ensureString(value, field).trim().toLowerCase();
  if (!REASONING_EFFORTS.has(raw as ChatReasoningEffort)) {
    throw new Error(`Expected reasoning_effort one of low|medium|high|xhigh for ${field}.`);
  }
  return raw as ChatReasoningEffort;
}

export function parseChatCompletionRequest(value: unknown): ChatCompletionRequest {
  const input = ensureRecord(value, 'chat_completion_request');
  return {
    model: ensureString(
      input.model,
      'chat_completion_request.model'
    ) as ChatCompletionRequest['model'],
    messages: ensureMessageArray(input.messages, 'chat_completion_request.messages'),
    stream:
      input.stream == null
        ? undefined
        : ensureBooleanLike(input.stream, 'chat_completion_request.stream'),
    max_tokens:
      input.max_tokens == null
        ? undefined
        : ensurePositiveIntegerLike(input.max_tokens, 'chat_completion_request.max_tokens'),
    temperature:
      input.temperature == null
        ? undefined
        : ensureFiniteNumberLike(input.temperature, 'chat_completion_request.temperature'),
    user: ensureOptionalString(input.user, 'chat_completion_request.user'),
    reasoning_effort: parseReasoningEffort(
      input.reasoning_effort ?? input.reasoningEffort,
      'chat_completion_request.reasoning_effort'
    ),
    provider: ensureOptionalString(
      input.provider ?? input.model_provider ?? input.modelProvider,
      'chat_completion_request.provider'
    ),
    max_price_usd:
      input.max_price_usd == null && input.maxPriceUsd == null
        ? undefined
        : ensureFiniteNumberLike(
            input.max_price_usd ?? input.maxPriceUsd,
            'chat_completion_request.max_price_usd'
          ),
    max_price_ratio:
      input.max_price_ratio == null && input.maxPriceRatio == null
        ? undefined
        : ensureFiniteNumberLike(
            input.max_price_ratio ?? input.maxPriceRatio,
            'chat_completion_request.max_price_ratio'
          ),
    raidRequest:
      input.raidRequest == null && input.raid_request == null
        ? undefined
        : parseBossRaidRequest(input.raidRequest ?? input.raid_request),
    raidPolicy:
      input.raidPolicy == null && input.raid_policy == null
        ? undefined
        : (ensureRecord(
            input.raidPolicy ?? input.raid_policy,
            'chat_completion_request.raid_policy'
          ) as ChatCompletionRequest['raidPolicy']),
  };
}

export function buildBossRaidRequestFromChatCompletion(
  input: ChatCompletionRequest,
  options?: {
    defaultMaxTotalCost?: number;
  }
): BossRaidRequest {
  const trimmedMessages = input.messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
  const userMessages = trimmedMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.content);
  const primaryPrompt =
    userMessages[userMessages.length - 1] ??
    trimmedMessages[trimmedMessages.length - 1]?.content ??
    'Chat completion request';
  const title = primaryPrompt.slice(0, 80);
  const rawRaidPolicy = ensureOptionalRecord(
    input.raidPolicy,
    'chat_completion_request.raid_policy'
  );
  const maxAgentsValue = rawRaidPolicy?.maxAgents ?? rawRaidPolicy?.max_agents;
  const maxAgents =
    maxAgentsValue == null
      ? 2
      : ensurePositiveIntegerLike(maxAgentsValue, 'chat_completion_request.raid_policy.max_agents');
  const maxTotalCostValue =
    rawRaidPolicy?.maxTotalCost ?? rawRaidPolicy?.max_total_cost ?? options?.defaultMaxTotalCost;
  const maxTotalCost = ensureFiniteNumberLike(
    maxTotalCostValue,
    'chat_completion_request.raid_policy.max_total_cost'
  );
  const maxLatencySec =
    rawRaidPolicy?.maxLatencySec == null && rawRaidPolicy?.max_latency_sec == null
      ? undefined
      : ensureFiniteNumberLike(
          rawRaidPolicy?.maxLatencySec ?? rawRaidPolicy?.max_latency_sec,
          'chat_completion_request.raid_policy.max_latency_sec'
        );
  const requiredCapabilitiesValue =
    rawRaidPolicy?.requiredCapabilities ?? rawRaidPolicy?.required_capabilities;
  const requiredCapabilities =
    requiredCapabilitiesValue == null
      ? undefined
      : ensureStringArray(
          requiredCapabilitiesValue,
          'chat_completion_request.raid_policy.required_capabilities'
        );

  return {
    agent: 'mercenary-v1',
    taskType: 'analysis',
    task: {
      title: title || 'Chat completion request',
      description:
        trimmedMessages
          .map((message) => `${formatChatRoleLabel(message.role)}:\n${message.content}`)
          .join('\n\n') || primaryPrompt,
      language: 'text',
      files: [
        {
          path: '.bossraid/chat-options.json',
          content: JSON.stringify({
            model: input.model,
            max_tokens: input.max_tokens,
            temperature: input.temperature,
            reasoning_effort: input.reasoning_effort,
          }),
          sha256: 'chat-options',
        },
      ],
      failingSignals: {
        errors: [],
        expectedBehavior: primaryPrompt,
      },
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'json'],
    },
    raidPolicy: {
      maxAgents,
      maxLatencySec,
      maxTotalCost,
      requiredCapabilities,
      minReputationScore:
        rawRaidPolicy?.minReputationScore == null && rawRaidPolicy?.min_reputation_score == null
          ? undefined
          : ensureFiniteNumberLike(
              rawRaidPolicy?.minReputationScore ?? rawRaidPolicy?.min_reputation_score,
              'chat_completion_request.raid_policy.min_reputation_score'
            ),
      requireErc8004:
        rawRaidPolicy?.requireErc8004 == null && rawRaidPolicy?.require_erc8004 == null
          ? undefined
          : ensureBooleanLike(
              rawRaidPolicy?.requireErc8004 ?? rawRaidPolicy?.require_erc8004,
              'chat_completion_request.raid_policy.require_erc8004'
            ),
      minTrustScore:
        rawRaidPolicy?.minTrustScore == null && rawRaidPolicy?.min_trust_score == null
          ? undefined
          : ensureFiniteNumberLike(
              rawRaidPolicy?.minTrustScore ?? rawRaidPolicy?.min_trust_score,
              'chat_completion_request.raid_policy.min_trust_score'
            ),
      requiredVerificationStatus:
        rawRaidPolicy?.requiredVerificationStatus == null &&
        rawRaidPolicy?.required_verification_status == null
          ? undefined
          : ensureProviderVerificationStatus(
              rawRaidPolicy?.requiredVerificationStatus ??
                rawRaidPolicy?.required_verification_status,
              'chat_completion_request.raid_policy.required_verification_status'
            ),
      maxInputTokens:
        rawRaidPolicy?.maxInputTokens == null && rawRaidPolicy?.max_input_tokens == null
          ? undefined
          : ensurePositiveIntegerLike(
              rawRaidPolicy?.maxInputTokens ?? rawRaidPolicy?.max_input_tokens,
              'chat_completion_request.raid_policy.max_input_tokens'
            ),
      maxOutputTokens:
        rawRaidPolicy?.maxOutputTokens == null && rawRaidPolicy?.max_output_tokens == null
          ? undefined
          : ensurePositiveIntegerLike(
              rawRaidPolicy?.maxOutputTokens ?? rawRaidPolicy?.max_output_tokens,
              'chat_completion_request.raid_policy.max_output_tokens'
            ),
      allowedModelFamilies:
        rawRaidPolicy?.allowedModelFamilies == null && rawRaidPolicy?.allowed_model_families == null
          ? undefined
          : ensureStringArray(
              rawRaidPolicy?.allowedModelFamilies ?? rawRaidPolicy?.allowed_model_families,
              'chat_completion_request.raid_policy.allowed_model_families'
            ),
      allowedAgentFrameworks:
        rawRaidPolicy?.allowedAgentFrameworks == null &&
        rawRaidPolicy?.allowed_agent_frameworks == null
          ? undefined
          : ensureAgentFrameworkArray(
              rawRaidPolicy?.allowedAgentFrameworks ?? rawRaidPolicy?.allowed_agent_frameworks,
              'chat_completion_request.raid_policy.allowed_agent_frameworks'
            ),
      allowedModelProviders:
        rawRaidPolicy?.allowedModelProviders == null &&
        rawRaidPolicy?.allowed_model_providers == null
          ? undefined
          : ensureStringArray(
              rawRaidPolicy?.allowedModelProviders ?? rawRaidPolicy?.allowed_model_providers,
              'chat_completion_request.raid_policy.allowed_model_providers'
            ),
      allowedModelIds:
        rawRaidPolicy?.allowedModelIds == null && rawRaidPolicy?.allowed_model_ids == null
          ? undefined
          : ensureStringArray(
              rawRaidPolicy?.allowedModelIds ?? rawRaidPolicy?.allowed_model_ids,
              'chat_completion_request.raid_policy.allowed_model_ids'
            ),
      allowedOutputTypes: ['text', 'json'],
      privacyMode:
        rawRaidPolicy?.privacyMode == null && rawRaidPolicy?.privacy_mode == null
          ? 'prefer'
          : ensurePrivacyRoutingMode(
              rawRaidPolicy?.privacyMode ?? rawRaidPolicy?.privacy_mode,
              'chat_completion_request.raid_policy.privacy_mode'
            ),
      requirePrivacyFeatures:
        rawRaidPolicy?.requirePrivacyFeatures == null &&
        rawRaidPolicy?.require_privacy_features == null
          ? undefined
          : ensurePrivacyFeatureArray(
              rawRaidPolicy?.requirePrivacyFeatures ?? rawRaidPolicy?.require_privacy_features,
              'chat_completion_request.raid_policy.require_privacy_features'
            ),
      selectionMode:
        rawRaidPolicy?.selectionMode == null && rawRaidPolicy?.selection_mode == null
          ? 'best_match'
          : ensureSelectionMode(
              rawRaidPolicy?.selectionMode ?? rawRaidPolicy?.selection_mode,
              'chat_completion_request.raid_policy.selection_mode'
            ),
    },
    hostContext: {
      host: 'codex',
    },
  };
}

function formatChatRoleLabel(role: ChatCompletionMessage['role']): string {
  switch (role) {
    case 'system':
      return 'System';
    case 'assistant':
      return 'Assistant';
    case 'user':
    default:
      return 'User';
  }
}
