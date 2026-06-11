import { createHash } from 'node:crypto';
import type {
  BossRaidRequest,
  BossRaidSpawnInput,
  FailingSignals,
  HostContext,
  OutputType,
  PrivacyMode,
  RaidConstraints,
  RewardPolicy,
  SupportedLanguage,
  TaskFile,
} from '@bossraid/shared-types';
import {
  buildNormalizedDelegateRaidPolicy,
  buildRaidConstraintsFromFields,
  constraintsFromRaidPolicy,
  raidConstraintsFieldLabels,
  readRaidConstraintsFields,
} from '../raid-policy.js';
import {
  ApiContractError,
  ensureBoolean,
  ensureHost,
  ensureLanguage,
  ensureNumber,
  ensureOptionalRecord,
  ensureOptionalString,
  ensureOutputType,
  ensureOutputTypeArray,
  ensureRecord,
  ensureString,
  ensureStringArray,
} from '../validation.js';

function parseTaskFiles(value: unknown): TaskFile[] {
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

function parseFailingSignals(value: unknown): FailingSignals {
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

function parseRaidConstraints(value: unknown): RaidConstraints {
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

function parseRewardPolicy(value: unknown): RewardPolicy {
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

function parsePrivacyMode(value: unknown): PrivacyMode {
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

function parseHostContext(value: unknown): HostContext | undefined {
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

function parseOutputConfig(
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

export function parseBossRaidSpawnInput(value: unknown): BossRaidSpawnInput {
  const input = ensureRecord(value, 'spawn_input');
  return {
    taskTitle: ensureString(input.taskTitle ?? input.task_title, 'task_title'),
    taskDescription: ensureString(
      input.taskDescription ?? input.task_description,
      'task_description'
    ),
    language: ensureLanguage(input.language, 'language'),
    framework: ensureOptionalString(input.framework, 'framework'),
    files: parseTaskFiles(input.files),
    failingSignals: parseFailingSignals(input.failingSignals ?? input.failing_signals),
    output:
      input.output == null ? undefined : parseOutputConfig(input.output, 'spawn_input.output'),
    constraints: parseRaidConstraints(input.constraints),
    rewardPolicy: parseRewardPolicy(input.rewardPolicy ?? input.reward_policy),
    privacyMode: parsePrivacyMode(input.privacyMode ?? input.privacy_mode),
    hostContext: parseHostContext(input.hostContext ?? input.host_context),
  };
}

export function parseBossRaidRequest(value: unknown): BossRaidSpawnInput {
  const input = ensureRecord(value, 'raid_request');
  const task = ensureRecord(input.task, 'task');
  const raidPolicy = input.raidPolicy == null ? {} : ensureRecord(input.raidPolicy, 'raid_policy');

  return {
    taskTitle: ensureString(task.title, 'task.title'),
    taskDescription: ensureString(task.description, 'task.description'),
    language: ensureLanguage(task.language, 'task.language'),
    framework: ensureOptionalString(task.framework, 'task.framework'),
    files: parseTaskFiles(task.files),
    failingSignals:
      task.failingSignals == null && task.failing_signals == null
        ? { errors: [] }
        : parseFailingSignals(task.failingSignals ?? task.failing_signals),
    output:
      input.output == null
        ? {
            primaryType: 'patch',
            artifactTypes: ['patch', 'text'],
          }
        : parseOutputConfig(input.output, 'raid_request.output'),
    constraints: constraintsFromRaidPolicy(raidPolicy),
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: parseHostContext(input.hostContext ?? input.host_context),
  };
}

export function buildBossRaidRequestFromDelegateInput(value: unknown): BossRaidRequest {
  const args = ensureRecord(value, 'delegate_input');
  const prompt = ensureString(args.prompt, 'prompt').trim();
  const system = ensureOptionalString(args.system, 'system');
  const title =
    ensureOptionalString(args.title, 'title') ??
    ensureOptionalString(args.taskTitle ?? args.task_title, 'task_title') ??
    prompt
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) ??
    'Boss Raid task';
  const files = normalizeDelegateTaskFiles(args.files);
  const language = normalizeDelegateLanguage(args.language, files);
  const output = normalizeDelegateOutput(args.output, files.length > 0);
  const taskType =
    ensureOptionalString(args.taskType ?? args.task_type, 'task_type') ??
    inferDelegateTaskType(output.primaryType, files.length > 0);

  return {
    agent: 'mercenary-v1',
    taskType,
    task: {
      title,
      description:
        ensureOptionalString(args.description, 'description') ??
        [system, prompt].filter(Boolean).join('\n\n'),
      language,
      framework: ensureOptionalString(args.framework, 'framework'),
      files,
      failingSignals: normalizeDelegateFailingSignals(args),
    },
    output,
    raidPolicy: buildNormalizedDelegateRaidPolicy(args),
    hostContext: normalizeDelegateHostContext(args),
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
    return ensureLanguage(value, 'language');
  }

  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith('.py')) {
      return 'python';
    }
    if (lower.endsWith('.sol')) {
      return 'solidity';
    }
    if (lower.endsWith('.cs')) {
      return 'csharp';
    }
    if (
      lower.endsWith('.ts') ||
      lower.endsWith('.tsx') ||
      lower.endsWith('.js') ||
      lower.endsWith('.jsx')
    ) {
      return 'typescript';
    }
  }

  return 'text';
}

function inferDelegateTaskType(primaryType: OutputType, hasFiles: boolean): string {
  if (primaryType === 'patch' || hasFiles) {
    return 'code_task';
  }

  return 'analysis';
}

function normalizeDelegateOutput(
  value: unknown,
  hasFiles: boolean
): NonNullable<BossRaidRequest['output']> {
  const input = ensureOptionalRecord(value, 'output');
  const primarySource = input?.primaryType ?? input?.primary_type;
  const primaryType =
    primarySource == null
      ? hasFiles
        ? 'patch'
        : 'text'
      : ensureOutputType(primarySource, 'output.primary_type');
  const artifactSource = input?.artifactTypes ?? input?.artifact_types;
  const artifactTypes: OutputType[] =
    artifactSource == null
      ? primaryType === 'patch'
        ? ['patch', 'text']
        : ['text', 'json']
      : ensureOutputTypeArray(artifactSource, 'output.artifact_types');

  return {
    primaryType,
    artifactTypes,
  };
}

function normalizeDelegateFailingSignals(args: Record<string, unknown>): FailingSignals {
  const input = ensureOptionalRecord(
    args.failingSignals ?? args.failing_signals,
    'failing_signals'
  );
  const errorsSource = input?.errors ?? args.errors;
  const testsSource = input?.tests ?? args.tests;
  const reproStepsSource =
    input?.reproSteps ?? input?.repro_steps ?? args.reproSteps ?? args.repro_steps;

  return {
    errors: errorsSource == null ? [] : ensureStringArray(errorsSource, 'failingSignals.errors'),
    tests: testsSource == null ? undefined : ensureStringArray(testsSource, 'failingSignals.tests'),
    reproSteps:
      reproStepsSource == null
        ? undefined
        : ensureStringArray(reproStepsSource, 'failingSignals.reproSteps'),
    expectedBehavior: ensureOptionalString(
      input?.expectedBehavior ??
        input?.expected_behavior ??
        args.expectedBehavior ??
        args.expected_behavior,
      'failingSignals.expectedBehavior'
    ),
    observedBehavior: ensureOptionalString(
      input?.observedBehavior ??
        input?.observed_behavior ??
        args.observedBehavior ??
        args.observed_behavior,
      'failingSignals.observedBehavior'
    ),
  };
}

function normalizeDelegateHostContext(args: Record<string, unknown>): HostContext {
  const input = ensureOptionalRecord(args.hostContext ?? args.host_context, 'host_context');
  const hostSource = args.host ?? input?.host;

  return {
    host: hostSource == null ? 'codex' : ensureHost(hostSource, 'hostContext.host'),
    sessionId: ensureOptionalString(
      args.sessionId ?? args.session_id ?? input?.sessionId ?? input?.session_id,
      'hostContext.sessionId'
    ),
    repoRootHint: ensureOptionalString(
      args.repoRootHint ?? args.repo_root_hint ?? input?.repoRootHint ?? input?.repo_root_hint,
      'hostContext.repoRootHint'
    ),
    branchName: ensureOptionalString(
      args.branchName ?? args.branch_name ?? input?.branchName ?? input?.branch_name,
      'hostContext.branchName'
    ),
  };
}

function normalizeDelegateTaskFilesFromArray(value: unknown): TaskFile[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError('Expected array for files.');
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
  return createHash('sha256').update(value).digest('hex');
}
