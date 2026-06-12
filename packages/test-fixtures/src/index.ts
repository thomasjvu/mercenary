import type {
  BossRaidSpawnInput,
  ProviderHealthStatus,
  ProviderProfile,
} from '@bossraid/shared-types';

export function createSpawnInput(): BossRaidSpawnInput {
  return {
    taskTitle: 'Fix button state bug',
    taskDescription: 'Save button stays disabled after valid form input.',
    language: 'typescript',
    framework: 'react',
    files: [
      {
        path: 'src/components/Form.tsx',
        content: [
          'export function Form() {',
          '  const disabled = true;',
          '  return <button disabled={disabled}>Save</button>;',
          '}',
        ].join('\n'),
        sha256: 'test-file-hash',
      },
    ],
    failingSignals: {
      errors: ['Save button never enables.'],
      reproSteps: ['Open form', 'Enter valid values', 'Observe disabled button'],
    },
    output: {
      primaryType: 'patch',
      artifactTypes: ['patch', 'text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: [],
      minReputation: 0,
      allowedOutputTypes: ['patch', 'text'],
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

export function createGameSpawnInput(): BossRaidSpawnInput {
  return {
    taskTitle: 'Build a tiny GB Studio boss intro and launch package',
    taskDescription:
      'Create a playable GB Studio intro, define the pixel-art pack, and prepare the trailer package for the game reveal.',
    language: 'typescript',
    framework: 'gb-studio',
    files: [
      {
        path: 'game/project.gbsproj',
        content: JSON.stringify({
          scenes: ['ArenaIntro'],
          actors: ['Boss', 'Hero'],
        }),
        sha256: 'test-gb-studio-file-hash',
      },
    ],
    failingSignals: {
      errors: [],
      expectedBehavior:
        'Return a playable GB Studio patch plus matching pixel-art and trailer guidance.',
      reproSteps: ['Open the project', 'Add the boss intro', 'Package the art and promo support'],
    },
    output: {
      primaryType: 'patch',
      artifactTypes: ['patch', 'text'],
    },
    constraints: {
      numExperts: 3,
      maxBudgetUsd: 12,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: [],
      minReputation: 0,
      allowedOutputTypes: ['patch', 'text'],
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

export function createProviderProfile(
  providerId: string,
  overrides: Partial<ProviderProfile> = {}
): ProviderProfile {
  return {
    providerId,
    agentId: providerId,
    displayName: 'Test Provider',
    endpointType: 'http',
    endpoint: `http://127.0.0.1/${providerId}`,
    specializations: ['react', 'debugging'],
    supportedLanguages: ['typescript'],
    supportedFrameworks: ['react'],
    pricePerTaskUsd: 2,
    maxConcurrency: 1,
    status: 'available',
    outputTypes: ['patch', 'text'],
    privacy: {},
    reputation: {
      globalScore: 0.9,
      responsivenessScore: 0.9,
      validityScore: 0.9,
      qualityScore: 0.9,
      timeoutRate: 0,
      duplicateRate: 0,
      specializationScores: {},
      p50LatencyMs: 1_000,
      p95LatencyMs: 2_000,
      totalRaids: 10,
      totalSuccessfulRaids: 9,
    },
    ...overrides,
  };
}

export function readyHealth(providerId: string): ProviderHealthStatus {
  return {
    providerId,
    endpoint: `http://127.0.0.1/${providerId}`,
    reachable: true,
    ready: true,
  };
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export { FAST_TEST_TIMING, type TestOrchestratorTiming } from './orchestrator-timing.js';
export { buildDelegateRaidRequestFromSpawn } from './delegate-request.js';

export async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('Timed out waiting for condition.');
}
