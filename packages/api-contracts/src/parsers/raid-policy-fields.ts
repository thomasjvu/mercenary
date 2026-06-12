import type {
  FailingSignals,
  HostContext,
  OutputType,
  PrivacyMode,
  RaidConstraints,
  RewardPolicy,
  TaskFile,
} from '@bossraid/shared-types';
import {
  buildRaidConstraintsFromFields,
  raidConstraintsFieldLabels,
  readRaidConstraintsFields,
} from '../raid-policy.js';
import {
  ApiContractError,
  ensureBoolean,
  ensureHost,
  ensureLanguage,
  ensureNumber,
  ensureOptionalString,
  ensureOutputType,
  ensureOutputTypeArray,
  ensureRecord,
  ensureString,
  ensureStringArray,
} from '../validation.js';

export function parseTaskFiles(value: unknown): TaskFile[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError('Expected array for files.');
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

export function parseFailingSignals(value: unknown): FailingSignals {
  const input = ensureRecord(value, 'failing_signals');
  return {
    errors: ensureStringArray(input.errors, 'failing_signals.errors'),
    tests:
      input.tests == null ? undefined : ensureStringArray(input.tests, 'failing_signals.tests'),
    reproSteps:
      input.reproSteps == null && input.repro_steps == null
        ? undefined
        : ensureStringArray(input.reproSteps ?? input.repro_steps, 'failing_signals.repro_steps'),
    expectedBehavior: ensureOptionalString(
      input.expectedBehavior ?? input.expected_behavior,
      'failing_signals.expected_behavior'
    ),
    observedBehavior: ensureOptionalString(
      input.observedBehavior ?? input.observed_behavior,
      'failing_signals.observed_behavior'
    ),
  };
}

export function parseRaidConstraints(value: unknown): RaidConstraints {
  const input = ensureRecord(value, 'constraints');

  return buildRaidConstraintsFromFields(
    readRaidConstraintsFields(input),
    {
      numExperts: ensureNumber(input.numExperts ?? input.num_experts, 'constraints.num_experts'),
      maxBudgetUsd: ensureNumber(
        input.maxBudgetUsd ?? input.max_budget_usd,
        'constraints.max_budget_usd'
      ),
      maxLatencySec: ensureNumber(
        input.maxLatencySec ?? input.max_latency_sec,
        'constraints.max_latency_sec'
      ),
      allowExternalSearch: ensureBoolean(
        input.allowExternalSearch ?? input.allow_external_search,
        'constraints.allow_external_search'
      ),
      requireSpecializations: ensureStringArray(
        input.requireSpecializations ?? input.require_specializations ?? [],
        'constraints.require_specializations'
      ),
      minReputation: ensureNumber(
        input.minReputation ?? input.min_reputation,
        'constraints.min_reputation'
      ),
    },
    raidConstraintsFieldLabels('constraints')
  );
}

export function parseRewardPolicy(value: unknown): RewardPolicy {
  if (value == null) {
    return {
      splitStrategy: 'equal_success_only',
    };
  }

  const input = ensureRecord(value, 'reward_policy');
  const splitStrategy = input.splitStrategy ?? input.split_strategy;

  if (splitStrategy == null) {
    return {
      splitStrategy: 'equal_success_only',
    };
  }

  const normalized = ensureString(splitStrategy, 'reward_policy.split_strategy');
  if (normalized !== 'equal_success_only') {
    throw new ApiContractError('Expected reward_policy.split_strategy to be equal_success_only.');
  }

  return {
    splitStrategy: normalized,
  };
}

export function parsePrivacyMode(value: unknown): PrivacyMode {
  const input = ensureRecord(value, 'privacy_mode');
  return {
    redactSecrets: ensureBoolean(
      input.redactSecrets ?? input.redact_secrets,
      'privacy_mode.redact_secrets'
    ),
    redactIdentifiers: ensureBoolean(
      input.redactIdentifiers ?? input.redact_identifiers,
      'privacy_mode.redact_identifiers'
    ),
    allowFullRepo: ensureBoolean(
      input.allowFullRepo ?? input.allow_full_repo,
      'privacy_mode.allow_full_repo'
    ),
  };
}

export function parseHostContext(value: unknown): HostContext | undefined {
  if (value == null) {
    return undefined;
  }

  const input = ensureRecord(value, 'host_context');
  return {
    host: ensureHost(input.host, 'host_context.host'),
    sessionId: ensureOptionalString(input.sessionId ?? input.session_id, 'host_context.session_id'),
    repoRootHint: ensureOptionalString(
      input.repoRootHint ?? input.repo_root_hint,
      'host_context.repo_root_hint'
    ),
    branchName: ensureOptionalString(
      input.branchName ?? input.branch_name,
      'host_context.branch_name'
    ),
  };
}

export function parseOutputConfig(
  value: unknown,
  label: string
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
        : ensureOutputTypeArray(
            input.artifactTypes ?? input.artifact_types,
            `${label}.artifact_types`
          ),
  };
}
