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
