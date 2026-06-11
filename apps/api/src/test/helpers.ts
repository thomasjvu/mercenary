import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mnemonicToAccount } from 'viem/accounts';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer } from '../index.js';

export const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

process.env.BOSSRAID_X402_ENABLED = 'false';
process.env.BOSSRAID_STORAGE_BACKEND = 'memory';

export function createRaidRequestBody() {
  return {
    agent: 'mercenary-v1',
    taskType: 'code_debugging',
    task: {
      title: 'Fix button state bug',
      description: 'Save button stays disabled after valid form input.',
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
    },
    output: {
      primaryType: 'patch',
      artifactTypes: ['patch', 'text'],
    },
    raidPolicy: {
      maxAgents: 1,
      allowedOutputTypes: ['patch', 'text'],
      maxTotalCost: 10,
      privacyMode: 'prefer',
    },
    hostContext: {
      host: 'codex',
    },
  };
}

export function createSpawnInputBody() {
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
      maxLatencySec: 60,
      allowExternalSearch: false,
      requireSpecializations: ['react'],
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
    displayName: providerId,
    endpointType: 'http',
    endpoint: `http://127.0.0.1/${providerId}`,
    specializations: ['react', 'analysis'],
    supportedLanguages: ['typescript', 'text'],
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
      p50LatencyMs: 500,
      p95LatencyMs: 1_000,
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

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function createX402PaidTestEnv(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
    ...overrides,
  };
}

export function installMockX402Facilitator() {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith('https://facilitator.test/')) {
      return originalFetch(input, init);
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as unknown;
    requests.push({ url, body });
    const payload = url.endsWith('/verify')
      ? { isValid: true, payer: '0xbuyer' }
      : { success: true, transaction: '0xsettled', network: 'eip155:84532', payer: '0xbuyer' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  };
  return {
    requests,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)])
    );
  }

  return value;
}

export function hashText(value: string): `0x${string}` {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

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

export async function createPublicSessionCookie(
  app: ReturnType<typeof buildApiServer>,
  walletIndex = 0
): Promise<{ cookie: string; wallet: string }> {
  const account = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: walletIndex });
  const nonce = await app.inject({
    method: 'POST',
    url: '/v1/auth/nonce',
    payload: {
      wallet: account.address,
    },
  });
  assert.equal(nonce.statusCode, 200);
  const message = nonce.json().message as string;
  const signature = await account.signMessage({ message });
  const verify = await app.inject({
    method: 'POST',
    url: '/v1/auth/verify',
    payload: {
      message,
      signature,
    },
  });
  assert.equal(verify.statusCode, 200);
  const cookie = verify.headers['set-cookie'];
  assert.equal(typeof cookie, 'string');
  return {
    cookie: cookie as string,
    wallet: account.address.toLowerCase(),
  };
}

export type TestOrchestratorTiming = {
  inviteAcceptMs: number;
  firstHeartbeatMs: number;
  hardExecutionMs: number;
  raidAbsoluteMs: number;
};

export const FAST_TEST_TIMING: TestOrchestratorTiming = {
  inviteAcceptMs: 1_000,
  firstHeartbeatMs: 1_000,
  hardExecutionMs: 1_000,
  raidAbsoluteMs: 1_000,
};

export function createTestOrchestrator(
  providers: RaidProvider[] = [],
  timing?: Partial<TestOrchestratorTiming>
): BossRaidOrchestrator {
  return new BossRaidOrchestrator(providers, timing, undefined, undefined, async (profile) =>
    readyHealth(profile.providerId)
  );
}

export function createTestApiServer(
  providers: RaidProvider[] = [],
  env: NodeJS.ProcessEnv = process.env,
  timing?: Partial<TestOrchestratorTiming>
) {
  return buildApiServer(createTestOrchestrator(providers, timing), env);
}

export { buildApiServer, mkdtemp, readFile, rm, join, tmpdir };
