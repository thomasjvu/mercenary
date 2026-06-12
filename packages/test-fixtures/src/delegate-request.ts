import type { BossRaidSpawnInput } from '@bossraid/shared-types';

export function buildDelegateRaidRequestFromSpawn(
  spawn: BossRaidSpawnInput,
  overrides: { agent?: string; taskType?: string } = {}
) {
  return {
    agent: overrides.agent ?? 'mercenary-v1',
    taskType: overrides.taskType ?? 'code_debugging',
    task: {
      title: spawn.taskTitle,
      description: spawn.taskDescription,
      language: spawn.language,
      framework: spawn.framework,
      files: spawn.files,
      failingSignals: spawn.failingSignals,
    },
    output: spawn.output,
    raidPolicy: {
      maxAgents: spawn.constraints.numExperts,
      allowedOutputTypes: spawn.constraints.allowedOutputTypes,
      maxTotalCost: spawn.constraints.maxBudgetUsd,
      privacyMode: spawn.constraints.privacyMode,
    },
    hostContext: spawn.hostContext,
  };
}
