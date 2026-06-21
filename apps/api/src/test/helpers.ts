import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mnemonicToAccount } from 'viem/accounts';
import {
  buildDelegateRaidRequestFromSpawn,
  createProviderProfile as createFixtureProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth as fixtureReadyHealth,
  type TestOrchestratorTiming,
} from '@bossraid/test-fixtures';

import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { clearEphemeralRateLimitsForTests } from '../control-state/ephemeral-rate-limits.js';
import { buildApiServer } from '../index.js';
import { BountyService, readBountyServiceConfig } from '../lib/bounty-service.js';
import { BountyStore } from '../lib/bounty-store.js';

export const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

process.env.BOSSRAID_X402_ENABLED = 'false';
process.env.BOSSRAID_STORAGE_BACKEND = 'memory';

export function createRaidRequestBody() {
  return buildDelegateRaidRequestFromSpawn(createSpawnInput());
}

export function createSpawnInputBody() {
  return {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      maxLatencySec: 60,
      requireSpecializations: ['react'],
    },
  };
}

export function createProviderProfile(
  providerId: string,
  overrides: Partial<ProviderProfile> = {}
): ProviderProfile {
  return createFixtureProviderProfile(providerId, {
    displayName: providerId,
    specializations: ['react', 'analysis'],
    supportedLanguages: ['typescript', 'text'],
    reputation: {
      ...createFixtureProviderProfile(providerId).reputation,
      p50LatencyMs: 500,
      p95LatencyMs: 1_000,
    },
    ...overrides,
  });
}

export function readyHealth(providerId: string): ProviderHealthStatus {
  return fixtureReadyHealth(providerId);
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

export function installMockX402Facilitator(options?: { payer?: string }) {
  const payer = options?.payer ?? '0xbuyer';
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
      ? { isValid: true, payer }
      : { success: true, transaction: '0xsettled', network: 'eip155:84532', payer };
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

type TestInjectOptions = {
  method?: 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS';
  url?: string;
  payload?: string | object | Buffer;
  headers?: Record<string, string | string[] | undefined>;
};

export async function injectWithPublicSession(
  app: ReturnType<typeof buildApiServer>,
  options: TestInjectOptions,
  walletIndex = 0
) {
  const { cookie } = await createPublicSessionCookie(app, walletIndex);
  const headers = {
    ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    cookie,
  };

  return app.inject({
    ...options,
    headers,
  });
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

export { FAST_TEST_TIMING, type TestOrchestratorTiming };

export function createTestOrchestrator(
  providers: RaidProvider[] = [],
  timing?: Partial<TestOrchestratorTiming>
): BossRaidOrchestrator {
  return new BossRaidOrchestrator(providers, timing, undefined, undefined, async (profile) =>
    readyHealth(profile.providerId)
  );
}

function normalizeInjectOptions(options: string | TestInjectOptions): TestInjectOptions {
  return typeof options === 'string' ? { url: options } : options;
}

function mercenaryRouteNeedsSession(method: string | undefined, url: string | undefined) {
  if (method !== 'POST' || !url) {
    return false;
  }

  return url.startsWith('/v1/raid') || url.includes('/chat/completions');
}

export function wrapMercenaryTestInject<T extends ReturnType<typeof buildApiServer>>(app: T): T {
  const originalInject = app.inject.bind(app) as (
    options: string | TestInjectOptions
  ) => ReturnType<typeof app.inject>;
  let sessionCookie: string | undefined;

  const injectWithSession = async (options: string | TestInjectOptions) => {
    const normalized = normalizeInjectOptions(options);
    const headers = {
      ...(normalized.headers && typeof normalized.headers === 'object' ? normalized.headers : {}),
    } as Record<string, string | string[] | undefined>;
    const authorization = headers.authorization;
    const hasBearerAuth = typeof authorization === 'string' && authorization.startsWith('Bearer ');

    if (
      mercenaryRouteNeedsSession(normalized.method, normalized.url) &&
      !hasBearerAuth &&
      !headers.cookie
    ) {
      sessionCookie ??= (await createPublicSessionCookie(app as ReturnType<typeof buildApiServer>))
        .cookie;
      headers.cookie = sessionCookie;
    }

    return originalInject({
      ...normalized,
      headers,
    });
  };

  Object.assign(app, { inject: injectWithSession });

  return app;
}

export function createTestApiServer(
  providers: RaidProvider[] = [],
  env: NodeJS.ProcessEnv = process.env,
  timing?: Partial<TestOrchestratorTiming>
) {
  const testEnv = {
    ...env,
    BOSSRAID_SETTLEMENT_MODE: env.BOSSRAID_SETTLEMENT_MODE ?? 'off',
  };
  return wrapMercenaryTestInject(
    buildApiServer(createTestOrchestrator(providers, timing), testEnv)
  );
}

export function buildTestApiServer(
  orchestrator: BossRaidOrchestrator,
  env: NodeJS.ProcessEnv = process.env
) {
  return wrapMercenaryTestInject(
    buildApiServer(orchestrator, {
      ...env,
      BOSSRAID_SETTLEMENT_MODE: env.BOSSRAID_SETTLEMENT_MODE ?? 'off',
    })
  );
}

export async function createTestBountyService(options?: {
  prefix?: string;
  env?: NodeJS.ProcessEnv;
  dbFileName?: string;
}): Promise<{ service: BountyService; store: BountyStore; dir: string }> {
  const prefix = options?.prefix ?? 'bossraid-bounty-test-';
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = new BountyStore(join(dir, options?.dbFileName ?? 'bounties.sqlite'));
  const service = new BountyService(store, readBountyServiceConfig(options?.env ?? process.env));
  return { service, store, dir };
}

export { buildApiServer, clearEphemeralRateLimitsForTests, mkdtemp, readFile, rm, join, tmpdir };
