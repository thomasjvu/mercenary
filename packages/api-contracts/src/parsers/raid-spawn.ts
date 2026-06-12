import type { BossRaidSpawnInput } from '@bossraid/shared-types';
import { ensureLanguage, ensureOptionalString, ensureRecord, ensureString } from '../validation.js';
import {
  parseFailingSignals,
  parseHostContext,
  parseOutputConfig,
  parsePrivacyMode,
  parseRaidConstraints,
  parseRewardPolicy,
  parseTaskFiles,
} from './raid-policy-fields.js';

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
