import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverMessageAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer } from './index.js';
import {
  createProviderProfile,
  hashText,
  join,
  mkdtemp,
  readyHealth,
  rm,
  stableStringify,
  TEST_MNEMONIC,
  tmpdir,
} from './test/helpers.js';

test('GET /ready reports public beta readiness gates', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ready: true,
        model: 'gpt-5.5',
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-ready-market', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      outputTypes: ['text'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-ready-market',
      };
    },
    async run(): Promise<void> {},
  };
  const app = buildApiServer(
    new BossRaidOrchestrator([provider], undefined, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'false',
      BOSSRAID_STORAGE_BACKEND: 'memory',
    }
  );

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, true);
    assert.equal(response.json().gates.storage, true);
    assert.equal(response.json().gates.providers, true);
    assert.equal(response.json().payment.enabled, false);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('ops settings expose and toggle the runtime x402 gate', async () => {
  const app = buildApiServer(new BossRaidOrchestrator([]), {
    ...process.env,
    BOSSRAID_ADMIN_TOKEN: 'admin-settings-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });

  try {
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/ops/settings',
    });
    assert.equal(unauthorized.statusCode, 401);

    const initial = await app.inject({
      method: 'GET',
      url: '/v1/ops/settings',
      headers: {
        authorization: 'Bearer admin-settings-token-with-production-length',
      },
    });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.json().x402.enabled, false);
    assert.equal(initial.json().x402.canEnable, true);

    const enabled = await app.inject({
      method: 'PATCH',
      url: '/v1/ops/settings',
      headers: {
        authorization: 'Bearer admin-settings-token-with-production-length',
        'content-type': 'application/json',
      },
      payload: {
        x402Enabled: true,
      },
    });
    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.json().x402.enabled, true);

    const ready = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.json().payment.enabled, true);
  } finally {
    await app.close();
  }
});

test('ops metrics are admin-gated and expose route counters', async () => {
  const app = buildApiServer(new BossRaidOrchestrator([]), {
    ...process.env,
    BOSSRAID_ADMIN_TOKEN: 'admin-metrics-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const unauthenticatedPrometheus = await app.inject({
      method: 'GET',
      url: '/metrics',
    });
    assert.equal(unauthenticatedPrometheus.statusCode, 401);

    await app.inject({
      method: 'GET',
      url: '/health',
    });

    const metrics = await app.inject({
      method: 'GET',
      url: '/v1/ops/metrics',
      headers: {
        authorization: 'Bearer admin-metrics-token-with-production-length',
      },
    });
    assert.equal(metrics.statusCode, 200);
    assert.equal(typeof metrics.json().counters['http.requests_total'], 'number');
    assert.equal(Boolean(metrics.json().routes['GET /health']), true);

    const prometheus = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: {
        authorization: 'Bearer admin-metrics-token-with-production-length',
      },
    });
    assert.equal(prometheus.statusCode, 200);
    assert.equal(prometheus.body.includes('bossraid_http_requests_total'), true);
  } finally {
    await app.close();
  }
});

test('production readiness report surfaces full-production blockers', async () => {
  const app = buildApiServer(new BossRaidOrchestrator([]), {
    ...process.env,
    NODE_ENV: 'test',
    BOSSRAID_ADMIN_TOKEN: 'admin-readiness-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ops/production-readiness',
      headers: {
        authorization: 'Bearer admin-readiness-token-with-production-length',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, false);
    assert.equal(response.json().status, 'blocked');
    assert.equal(
      response
        .json()
        .checks.some(
          (check: { id: string; status: string }) =>
            check.id === 'onchain_settlement' && check.status === 'fail'
        ),
      true
    );
    assert.equal(
      response
        .json()
        .nextActions.some((action: { check: string }) => action.check === 'tee_attestation'),
      true
    );
  } finally {
    await app.close();
  }
});

test('admin control routes require the configured admin token', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    const raidsUnauthorized = await app.inject({
      method: 'GET',
      url: '/v1/raids',
    });
    assert.equal(raidsUnauthorized.statusCode, 401);

    const raidsAuthorized = await app.inject({
      method: 'GET',
      url: '/v1/raids',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.equal(raidsAuthorized.statusCode, 200);
    assert.deepEqual(raidsAuthorized.json(), []);

    const abortUnauthorized = await app.inject({
      method: 'POST',
      url: '/v1/raid/raid_missing/abort',
    });
    assert.equal(abortUnauthorized.statusCode, 401);

    const abortAuthorized = await app.inject({
      method: 'POST',
      url: '/v1/raid/raid_missing/abort',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.equal(abortAuthorized.statusCode, 404);

    const replayUnauthorized = await app.inject({
      method: 'POST',
      url: '/v1/evaluations/raid_missing/replay',
    });
    assert.equal(replayUnauthorized.statusCode, 401);

    const replayAuthorized = await app.inject({
      method: 'POST',
      url: '/v1/evaluations/raid_missing/replay',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.equal(replayAuthorized.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('admin runtime route reports deploy posture without exposing secrets', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_DEPLOY_TARGET: 'phala-cvm',
    BOSSRAID_TEE_PLATFORM: 'phala',
    BOSSRAID_TEE_SOCKET_PATH: process.cwd(),
    BOSSRAID_EVAL_RUNTIME_EXECUTION: 'true',
    NODE_ENV: 'production',
  });

  try {
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/runtime',
    });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: 'GET',
      url: '/v1/runtime',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });

    assert.equal(authorized.statusCode, 200);
    assert.deepEqual(authorized.json(), {
      deploymentTarget: 'phala-cvm',
      nodeEnv: 'production',
      storageBackend: 'sqlite',
      trustProxy: false,
      bodyLimitBytes: 524288,
      providerHealthTimeoutMs: 5000,
      publicRateLimit: {
        max: 60,
        windowMs: 60000,
      },
      opsSession: {
        ttlSec: 43200,
        rateLimitMax: 10,
        rateLimitWindowMs: 300000,
      },
      evaluator: {
        runtimeExecutionRequested: true,
        runtimeExecutionEnabled: false,
        transport: 'disabled',
        sandboxMode: 'host',
        workerIsolation: 'per_job_process',
        jobTimeoutMs: 45000,
        jobContainerImageConfigured: false,
        dockerSocketConfigured: false,
        sandboxUrlConfigured: false,
        sandboxSocketConfigured: false,
        sandboxTokenConfigured: false,
        unsafeHostExecutionAllowed: false,
      },
      tee: {
        platform: 'phala',
        socketPath: process.cwd(),
        appWalletConfigured: false,
        appWalletAddress: null,
        appWalletError: null,
        pathExists: true,
        socketMounted: false,
      },
    });
  } finally {
    await app.close();
  }
});

test('admin evaluator smoke route requires admin auth', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_EVAL_RUNTIME_EXECUTION: 'true',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/runtime/evaluator-smoke',
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: 'unauthorized',
    });
  } finally {
    await app.close();
  }
});

test('admin evaluator smoke route returns 503 when runtime execution is disabled', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_EVAL_RUNTIME_EXECUTION: 'false',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/runtime/evaluator-smoke',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: 'runtime_execution_disabled',
      message: 'Runtime execution must be enabled before evaluator smoke checks can run.',
      evaluator: {
        transport: 'disabled',
        workerIsolation: 'per_job_process',
      },
    });
  } finally {
    await app.close();
  }
});

test('attested runtime route returns 503 when no TEE mnemonic is configured', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/attested-runtime',
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: 'tee_signer_not_configured',
      message: 'MNEMONIC environment variable is required for attested runtime proofs.',
    });
  } finally {
    await app.close();
  }
});

test('attested runtime route signs runtime state with the TEE wallet', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
    BOSSRAID_EVAL_RUNTIME_EXECUTION: 'true',
    BOSSRAID_EVAL_SANDBOX_MODE: 'socket',
    BOSSRAID_EVAL_SANDBOX_SOCKET: '/socket/evaluator.sock',
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/attested-runtime',
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      signer: string;
      message: string;
      messageHash: string;
      signature: `0x${string}`;
      payload: Record<string, unknown>;
    };

    const expectedSigner = mnemonicToAccount(TEST_MNEMONIC).address;
    assert.equal(body.signer, expectedSigner);
    assert.match(body.message, /^BossRaidAttestedRuntime\|version=1\|nonce=/);
    assert.match(body.messageHash, /^0x[0-9a-f]{64}$/);
    assert.equal(body.payload.deploymentTarget, 'eigencompute');
    assert.equal(body.payload.teePlatform, 'eigencompute');
    assert.equal(body.payload.storageBackend, 'sqlite');
    assert.equal(body.payload.providers, 0);
    assert.equal(body.payload.readyProviders, 0);
    assert.equal(body.payload.raids, 0);
    assert.equal(body.payload.evaluatorTransport, 'socket');
    assert.equal(body.payload.workerIsolation, 'per_job_process');
    assert.equal(typeof body.payload.timestamp, 'string');
    assert.equal(typeof body.payload.nonce, 'string');

    const recoveredSigner = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });
    assert.equal(recoveredSigner, expectedSigner);
  } finally {
    await app.close();
  }
});

test('attested raid result route requires the raid token and a configured TEE signer', async () => {
  const provider = {
    profile: createProviderProfile('provider-attested-read'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-attested-read',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text'],
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
  });
  const app = buildApiServer(orchestrator, {
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
  });

  try {
    const unauthorized = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}/attested-result`,
    });
    assert.equal(unauthorized.statusCode, 401);

    const signerUnavailable = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}/attested-result`,
      headers: {
        'x-bossraid-raid-token': spawn.raidAccessToken,
      },
    });
    assert.equal(signerUnavailable.statusCode, 503);
    assert.deepEqual(signerUnavailable.json(), {
      error: 'tee_signer_not_configured',
      message: 'MNEMONIC environment variable is required for attested raid result proofs.',
    });
  } finally {
    await app.close();
  }
});

test('attested raid result route signs the raid result with the TEE wallet', async () => {
  const provider = {
    profile: createProviderProfile('provider-attested-result'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-attested-result',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text'],
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
  });
  const app = buildApiServer(orchestrator, {
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
    BOSSRAID_EVAL_RUNTIME_EXECUTION: 'true',
    BOSSRAID_EVAL_SANDBOX_MODE: 'socket',
    BOSSRAID_EVAL_SANDBOX_SOCKET: '/socket/evaluator.sock',
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}/attested-result`,
      headers: {
        'x-bossraid-raid-token': spawn.raidAccessToken,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      signer: string;
      message: string;
      messageHash: string;
      signature: `0x${string}`;
      payload: {
        deploymentTarget: string;
        teePlatform: string;
        evaluatorTransport: string;
        workerIsolation: string;
        raidId: string;
        status: string;
        approvedSubmissionCount: number;
        resultHash: `0x${string}`;
        result: {
          raidId: string;
          status: string;
          approvedSubmissions?: unknown[];
        };
        timestamp: string;
        nonce: string;
      };
    };

    const expectedSigner = mnemonicToAccount(TEST_MNEMONIC).address;
    assert.equal(body.signer, expectedSigner);
    assert.match(body.message, /^BossRaidAttestedResult\|version=1\|nonce=/);
    assert.equal(body.messageHash, hashText(body.message));
    assert.equal(body.payload.deploymentTarget, 'eigencompute');
    assert.equal(body.payload.teePlatform, 'eigencompute');
    assert.equal(body.payload.evaluatorTransport, 'socket');
    assert.equal(body.payload.workerIsolation, 'per_job_process');
    assert.equal(body.payload.raidId, spawn.raidId);
    assert.equal(body.payload.result.raidId, spawn.raidId);
    assert.equal(body.payload.status, body.payload.result.status);
    assert.equal(body.payload.resultHash, hashText(stableStringify(body.payload.result)));
    assert.equal(
      body.payload.approvedSubmissionCount,
      body.payload.result.approvedSubmissions?.length ?? 0
    );
    assert.equal(typeof body.payload.timestamp, 'string');
    assert.equal(typeof body.payload.nonce, 'string');

    const recoveredSigner = await recoverMessageAddress({
      message: body.message,
      signature: body.signature,
    });
    assert.equal(recoveredSigner, expectedSigner);
  } finally {
    await app.close();
  }
});

test('ops session can authenticate internal control routes without a browser-shipped bearer', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    const sessionLogin = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'admin-secret',
      },
    });

    assert.equal(sessionLogin.statusCode, 200);
    const setCookie = sessionLogin.headers['set-cookie'];
    assert.equal(typeof setCookie, 'string');
    assert.match(String(setCookie), /HttpOnly/);
    assert.match(String(setCookie), /SameSite=Strict/);
    assert.match(String(setCookie), /Path=\/ops-api/);

    const cookie = String(setCookie).split(';')[0];

    const sessionStatus = await app.inject({
      method: 'GET',
      url: '/v1/ops/session',
      headers: {
        cookie,
      },
    });

    assert.equal(sessionStatus.statusCode, 200);
    assert.equal(sessionStatus.json().authenticated, true);

    const raidsAuthorized = await app.inject({
      method: 'GET',
      url: '/v1/raids',
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAuthorized.statusCode, 200);

    const sessionLogout = await app.inject({
      method: 'DELETE',
      url: '/v1/ops/session',
      headers: {
        cookie,
      },
    });

    assert.equal(sessionLogout.statusCode, 200);
    assert.equal(sessionLogout.json().authenticated, false);

    const raidsAfterLogout = await app.inject({
      method: 'GET',
      url: '/v1/raids',
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAfterLogout.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('ops session login is rate limited', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX: '1',
    BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'wrong-secret',
      },
    });
    assert.equal(firstAttempt.statusCode, 401);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'wrong-secret',
      },
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
    assert.equal(secondAttempt.headers['retry-after'], '60');
  } finally {
    await app.close();
  }
});

test('ops session survives API restarts when persistence is file-backed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-api-control-state-'));
  const env = {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_STORAGE_BACKEND: 'sqlite',
    BOSSRAID_SQLITE_FILE: join(dir, 'state.sqlite'),
  };

  const appA = buildApiServer(new BossRaidOrchestrator(), env);
  try {
    const login = await appA.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'admin-secret',
      },
    });

    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];

    await appA.close();

    const appB = buildApiServer(new BossRaidOrchestrator(), env);
    try {
      const sessionStatus = await appB.inject({
        method: 'GET',
        url: '/v1/ops/session',
        headers: {
          cookie,
        },
      });

      assert.equal(sessionStatus.statusCode, 200);
      assert.equal(sessionStatus.json().authenticated, true);
    } finally {
      await appB.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('admin control routes return 503 until admin auth is configured', async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/raids',
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: 'admin_auth_not_configured',
      message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
    });
  } finally {
    await app.close();
  }
});
