import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HttpRaidProvider,
  buildProviderAuthHeaders,
  buildProviderProfileFromRegistration,
  loadProviderProfilesFromFile,
  resolveProviderEndpointPath,
  verifyProviderAuth,
} from './index.js';
import type { ProviderTaskPackage } from '@bossraid/shared-types';

test('loadProviderProfilesFromFile expands env placeholders with default values', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'bossraid-provider-sdk-'));
  const file = join(tempDir, 'providers.json');
  await writeFile(
    file,
    JSON.stringify([
      {
        providerId: 'provider-defaults',
        displayName: 'Provider Defaults',
        endpointType: 'http',
        endpoint: 'http://provider-defaults:9001',
        specializations: ['analysis'],
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        modelFamily: 'venice',
        outputTypes: ['text'],
        pricePerTaskUsd: 1,
        maxConcurrency: 1,
        status: 'available',
        auth: {
          type: 'bearer',
          token: '${BOSSRAID_PROVIDER_A_TOKEN:-provider-token}',
        },
        erc8004: {
          agentId: '${TEST_ERC8004_AGENT_ID:-8004-provider-defaults}',
          operatorWallet:
            '${TEST_ERC8004_OPERATOR_WALLET:-0x1111111111111111111111111111111111111111}',
          registrationTx: '${TEST_ERC8004_REGISTRATION_TX:-0xproviderregistration}',
          identityRegistry: '${TEST_ERC8004_IDENTITY_REGISTRY:-0xidentityregistry}',
        },
      },
    ])
  );

  const [profile] = await loadProviderProfilesFromFile(file);
  assert.equal(profile.auth?.token, 'provider-token');
  assert.equal(profile.erc8004?.agentId, '8004-provider-defaults');
  assert.equal(profile.erc8004?.operatorWallet, '0x1111111111111111111111111111111111111111');
  assert.equal(profile.erc8004?.registrationTx, '0xproviderregistration');
});

test('buildProviderProfileFromRegistration preserves ERC-8004 verification payloads', () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: 'provider-verified',
    name: 'Provider Verified',
    endpoint: 'http://127.0.0.1:9001',
    erc8004: {
      agentId: '8004-verified',
      registrationTx: '0xverified',
      verification: {
        status: 'verified',
        checkedAt: '2026-03-23T00:00:00.000Z',
        chainId: '8453',
        agentRegistry: 'eip155:8453:0xregistry',
        registrationTxFound: true,
        operatorMatchesOwner: true,
      },
    },
  });

  assert.equal(profile.erc8004?.verification?.status, 'verified');
  assert.equal(profile.erc8004?.verification?.agentRegistry, 'eip155:8453:0xregistry');
  assert.equal(profile.erc8004?.verification?.operatorMatchesOwner, true);
});

test('buildProviderProfileFromRegistration canonicalizes providerId to the registering agent id', () => {
  const profile = buildProviderProfileFromRegistration(
    {
      agentId: 'riko',
      name: 'Riko',
      endpoint: 'http://127.0.0.1:9002',
    },
    {
      providerId: 'minimal-diff-hunter',
      agentId: 'minimal-diff-hunter',
      displayName: 'Old Riko',
      endpointType: 'http',
      endpoint: 'http://127.0.0.1:9002',
      specializations: ['video-marketing'],
      supportedLanguages: ['text'],
      supportedFrameworks: ['remotion'],
      pricePerTaskUsd: 2,
      maxConcurrency: 1,
      status: 'available',
      outputTypes: ['video', 'text', 'bundle'],
      privacy: {},
      reputation: {
        globalScore: 0.8,
        responsivenessScore: 0.8,
        validityScore: 0.8,
        qualityScore: 0.8,
        timeoutRate: 0,
        duplicateRate: 0,
        specializationScores: {},
        p50LatencyMs: 1000,
        p95LatencyMs: 2000,
        totalRaids: 1,
        totalSuccessfulRaids: 1,
      },
    }
  );

  assert.equal(profile.providerId, 'riko');
  assert.equal(profile.agentId, 'riko');
});

test('buildProviderProfileFromRegistration normalizes token-metered rate cards', () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: 'gemma-discount-seller',
    name: 'Gemma Discount Seller',
    endpoint: 'https://provider.example.com',
    modelProvider: 'google',
    modelId: 'gemma-4-31b-it',
    pricing: {
      mode: 'token_metered',
      pricePer1mInputTokensUsd: 0.08,
      pricePer1mOutputTokensUsd: 0.16,
      minimumChargeUsd: 0.01,
      currency: 'USD',
      rateCardVersion: 'gemma-discount-v1',
      upstreamModelId: 'google/gemma-4-31b-it',
      maxContextTokens: 131_072,
    },
  });

  assert.equal(profile.pricing?.mode, 'token_metered');
  assert.equal(profile.pricing?.pricePer1mInputTokensUsd, 0.08);
  assert.equal(profile.pricing?.pricePer1mOutputTokensUsd, 0.16);
  assert.equal(profile.pricing?.minimumChargeUsd, 0.01);
  assert.equal(profile.pricing?.rateCardVersion, 'gemma-discount-v1');
  assert.equal(profile.pricing?.upstreamModelId, 'google/gemma-4-31b-it');
  assert.equal(profile.pricing?.maxContextTokens, 131_072);
  assert.equal(typeof profile.pricing?.rateCardHash, 'string');
  assert.equal(profile.pricePerTaskUsd, 0.01);
});

test('buildProviderProfileFromRegistration preserves Party Quest source metadata', () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: 'pqf-game-dev',
    name: 'Game Dev Squad',
    endpoint: 'https://partyquest.example/boss-raid/providers/pqf-game-dev/',
    maxConcurrency: 3,
    source: {
      type: 'party_quest',
      targetType: 'formation',
      externalRef: 'pqf-game-dev',
      displayIcon: 'fire-b-fill',
      memberCount: 4,
    },
  });

  assert.equal(profile.maxConcurrency, 3);
  assert.deepEqual(profile.source, {
    type: 'party_quest',
    targetType: 'formation',
    externalRef: 'pqf-game-dev',
    displayIcon: 'fire-b-fill',
    memberCount: 4,
  });
});

test('resolveProviderEndpointPath preserves pathful Party Quest provider endpoints', () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: 'pqf-game-dev',
    name: 'Game Dev Squad',
    endpoint: 'https://partyquest.example/boss-raid/providers/pqf-game-dev/',
  });

  const accept = resolveProviderEndpointPath(profile, '/v1/raid/accept');
  const health = resolveProviderEndpointPath(profile, '/health');

  assert.equal(
    accept.url,
    'https://partyquest.example/boss-raid/providers/pqf-game-dev/v1/raid/accept'
  );
  assert.equal(accept.pathname, '/boss-raid/providers/pqf-game-dev/v1/raid/accept');
  assert.equal(health.url, 'https://partyquest.example/boss-raid/providers/pqf-game-dev/health');
});

test('bearer provider auth uses timing-safe comparison', () => {
  assert.equal(
    verifyProviderAuth({
      auth: { type: 'bearer', token: 'secret-token' },
      providerId: 'provider-a',
      method: 'POST',
      path: '/v1/raid/accept',
      body: '{}',
      authorizationHeader: 'Bearer secret-token',
    }),
    true
  );
  assert.equal(
    verifyProviderAuth({
      auth: { type: 'bearer', token: 'secret-token' },
      providerId: 'provider-a',
      method: 'POST',
      path: '/v1/raid/accept',
      body: '{}',
      authorizationHeader: 'Bearer secret-tokn',
    }),
    false
  );
});

test('auth.type none fails closed in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(
      verifyProviderAuth({
        auth: { type: 'none' },
        providerId: 'provider-a',
        method: 'GET',
        path: '/health',
        body: '',
      }),
      false
    );
  } finally {
    if (previousNodeEnv == null) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('HMAC provider auth signs and verifies the final provider endpoint path', () => {
  const body = JSON.stringify({ raidId: 'raid-pathful' });
  const headers = buildProviderAuthHeaders(
    { type: 'hmac', secret: 'path-secret' },
    'pqf-game-dev',
    'POST',
    '/boss-raid/providers/pqf-game-dev/v1/raid/accept',
    body
  );

  assert.equal(
    verifyProviderAuth({
      auth: { type: 'hmac', secret: 'path-secret' },
      providerId: 'pqf-game-dev',
      method: 'POST',
      path: '/boss-raid/providers/pqf-game-dev/v1/raid/accept',
      body,
      timestampHeader: headers['x-bossraid-timestamp'],
      signatureHeader: headers['x-bossraid-signature'],
      providerIdHeader: headers['x-bossraid-provider-id'],
    }),
    true
  );
  assert.equal(
    verifyProviderAuth({
      auth: { type: 'hmac', secret: 'path-secret' },
      providerId: 'pqf-game-dev',
      method: 'POST',
      path: '/v1/raid/accept',
      body,
      timestampHeader: headers['x-bossraid-timestamp'],
      signatureHeader: headers['x-bossraid-signature'],
      providerIdHeader: headers['x-bossraid-provider-id'],
    }),
    false
  );
});

test('Party Quest Boss Raid fixture preserves accept callback and settlement contract fields', () => {
  const profile = buildProviderProfileFromRegistration({
    agentId: 'pqf-bbs-arcade',
    name: 'BBS Arcade Squad',
    endpoint: 'https://partyquest.example/boss-raid/providers/pqf-bbs-arcade/',
    supportedLanguages: ['text', 'typescript'],
    supportedFrameworks: ['party-quest'],
    outputTypes: ['text', 'patch'],
    auth: {
      type: 'hmac',
      secret: 'partyquest-secret',
    },
    source: {
      type: 'party_quest',
      targetType: 'formation',
      externalRef: 'pqf-bbs-arcade',
      displayIcon: 'fire-b-fill',
      memberCount: 4,
    },
  });
  const task: ProviderTaskPackage = {
    raidId: 'raid-bbs-fixture',
    submissionFormat: 'party_quest_provider_v1',
    desiredOutput: {
      primaryType: 'text',
      artifactTypes: ['text', 'patch'],
    },
    task: {
      title: 'Ship a BBS app/game landing page',
      description: 'Exercise the Party Quest formation bridge.',
      language: 'text',
      framework: 'party-quest',
    },
    artifacts: {
      files: [
        {
          path: 'README.md',
          content: '# BBS fixture\n',
          sha256: 'partyquest-bossraid-fixture',
        },
      ],
      errors: [],
      reproSteps: ['Register Party Quest provider', 'Accept paid raid', 'Submit result'],
      tests: ['contract fixture'],
      expectedBehavior: 'Party Quest mirrors Boss Raid settlement into BBS.',
    },
    constraints: {
      maxChangedFiles: 8,
      maxDiffLines: 400,
      forbidPaths: [],
      mustNot: [],
    },
    deadlineUnix: 1_900_000_000,
  };
  const accept = resolveProviderEndpointPath(profile, '/v1/raid/accept');
  const body = JSON.stringify({
    raidId: task.raidId,
    providerId: profile.providerId,
    task,
    deadlineUnix: task.deadlineUnix,
  });
  const headers = buildProviderAuthHeaders(
    profile.auth,
    profile.providerId,
    'POST',
    accept.pathname,
    body
  );
  const providerRunId = 'pqr_fixture_run';
  const settlement = {
    raidId: task.raidId,
    providerId: profile.providerId,
    providerRunId,
    grossUsd: 100,
    feesUsd: 5,
    netUsd: 95,
    currency: 'USDC',
    valid: true,
    receiptPath: `/receipt?raidId=${task.raidId}`,
    assignment: {
      providerRunId,
    },
  };

  assert.equal(accept.pathname, '/boss-raid/providers/pqf-bbs-arcade/v1/raid/accept');
  assert.equal(headers['x-bossraid-provider-id'], 'pqf-bbs-arcade');
  assert.equal(
    verifyProviderAuth({
      auth: profile.auth,
      providerId: profile.providerId,
      method: 'POST',
      path: accept.pathname,
      body,
      timestampHeader: headers['x-bossraid-timestamp'],
      signatureHeader: headers['x-bossraid-signature'],
      providerIdHeader: headers['x-bossraid-provider-id'],
    }),
    true
  );
  assert.deepEqual(profile.source, {
    type: 'party_quest',
    targetType: 'formation',
    externalRef: 'pqf-bbs-arcade',
    displayIcon: 'fire-b-fill',
    memberCount: 4,
  });
  assert.deepEqual(settlement, {
    raidId: 'raid-bbs-fixture',
    providerId: 'pqf-bbs-arcade',
    providerRunId,
    grossUsd: 100,
    feesUsd: 5,
    netUsd: 95,
    currency: 'USDC',
    valid: true,
    receiptPath: '/receipt?raidId=raid-bbs-fixture',
    assignment: {
      providerRunId,
    },
  });
});

async function withInviteTimeoutEnv<T>(inviteAcceptMs: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.BOSSRAID_INVITE_ACCEPT_MS;
  process.env.BOSSRAID_INVITE_ACCEPT_MS = inviteAcceptMs;
  try {
    return await fn();
  } finally {
    if (previous == null) {
      delete process.env.BOSSRAID_INVITE_ACCEPT_MS;
    } else {
      process.env.BOSSRAID_INVITE_ACCEPT_MS = previous;
    }
  }
}

async function withMockedAcceptFetch<T>(responseDelayMs: number, fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    assert.equal(url, 'http://provider.test/v1/raid/accept');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, responseDelayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };

      if (init?.signal?.aborted) {
        onAbort();
        return;
      }

      init?.signal?.addEventListener('abort', onAbort, { once: true });
    });
    return new Response(JSON.stringify({ accepted: true, providerRunId: 'run-test' }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  }) as typeof fetch;

  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function createTestProvider(): HttpRaidProvider {
  return new HttpRaidProvider(
    buildProviderProfileFromRegistration({
      agentId: 'probe-provider',
      name: 'Probe Provider',
      endpoint: 'http://provider.test',
      auth: {
        type: 'none',
      },
    })
  );
}

function createTestTask(): ProviderTaskPackage {
  return {
    raidId: 'raid-test',
    submissionFormat: 'text_answer_plus_explanation',
    desiredOutput: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    task: {
      title: 'Probe task',
      description: 'Verify provider accept timeout behavior.',
      language: 'text',
    },
    artifacts: {
      files: [],
      errors: [],
      reproSteps: [],
      tests: [],
    },
    constraints: {
      maxChangedFiles: 1,
      maxDiffLines: 1,
      forbidPaths: [],
      mustNot: [],
    },
    deadlineUnix: Math.floor(Date.now() / 1000) + 60,
  };
}

test('HttpRaidProvider accept honors BOSSRAID_INVITE_ACCEPT_MS when the provider is slow', async () => {
  await withMockedAcceptFetch(100, async () => {
    await withInviteTimeoutEnv('50', async () => {
      const provider = createTestProvider();
      await assert.rejects(
        () => provider.accept(createTestTask()),
        /request timed out after 50 ms/
      );
    });
  });
});

test('HttpRaidProvider accept succeeds when BOSSRAID_INVITE_ACCEPT_MS exceeds provider latency', async () => {
  await withMockedAcceptFetch(50, async () => {
    await withInviteTimeoutEnv('250', async () => {
      const provider = createTestProvider();
      const acceptance = await provider.accept(createTestTask());
      assert.equal(acceptance.accepted, true);
      assert.equal(acceptance.providerRunId, 'run-test');
    });
  });
});
