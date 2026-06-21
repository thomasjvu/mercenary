import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverMessageAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer } from './index.js';
import {
  createTestApiServer,
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

test('admin control routes require the configured admin token', async () => {
  const app = createTestApiServer([], {
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

    const attestedUnauthorized = await app.inject({
      method: 'GET',
      url: '/v1/attested-runtime',
    });
    assert.equal(attestedUnauthorized.statusCode, 401);

    const attestedAuthorized = await app.inject({
      method: 'GET',
      url: '/v1/attested-runtime',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.notEqual(attestedAuthorized.statusCode, 401);

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
  const app = createTestApiServer([], {
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
  const app = createTestApiServer([], {
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
  const app = createTestApiServer([], {
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
  const app = createTestApiServer([], {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/attested-runtime',
      headers: {
        authorization: 'Bearer admin-secret',
      },
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
  const app = createTestApiServer([], {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
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
      headers: {
        authorization: 'Bearer admin-secret',
      },
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
