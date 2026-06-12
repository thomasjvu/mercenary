export function createBossRaidRequestPayload() {
  return {
    agent: 'mercenary-v1',
    taskType: 'analysis',
    task: {
      title: 'Explain the bug.',
      description: 'Inspect the helper and explain the bug.',
      language: 'text',
      files: [],
      failingSignals: {
        errors: [],
      },
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'json'],
    },
    raidPolicy: {
      maxAgents: 1,
      maxTotalCost: 3.5,
      privacyMode: 'prefer',
    },
    hostContext: {
      host: 'codex',
    },
  };
}

export function createSpawnInputPayload() {
  return {
    taskTitle: 'Explain the bug.',
    taskDescription: 'Inspect the helper and explain the bug.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'json'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 3.5,
      maxLatencySec: 60,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      privacyMode: 'prefer',
    },
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: 'codex',
    },
  };
}
