import assert from 'node:assert/strict';
import test from 'node:test';
import { NETWORK } from '@bossraid/constants';
import { createProviderProfile } from '@bossraid/test-fixtures';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ProviderSubmission } from '@bossraid/shared-types';
import { createApiControlState } from '../control-state.js';
import { InferenceReceiptStore } from './inference-receipt-store.js';
import {
  buildUpstreamSellerProviderId,
  createProviderRunId,
  isHostedInferenceProvider,
  probeHostedInferenceProviderHealth,
  resolveHostedProviderUpstream,
  resolveInferenceGatewayBase,
  resolveInferenceGatewayProviderEndpoint,
  runInferenceGatewayJob,
} from './inference-gateway.js';

test('resolveInferenceGatewayBase prefers configured base URL', () => {
  const base = resolveInferenceGatewayBase({
    BOSSRAID_INFERENCE_GATEWAY_BASE: 'https://gateway.example/',
  });
  assert.equal(base, 'https://gateway.example');
});

test('resolveInferenceGatewayBase falls back to local API origin', () => {
  const base = resolveInferenceGatewayBase({
    BOSSRAID_API_HOST: '127.0.0.1',
    PORT: '4101',
  });
  assert.equal(base, `http://127.0.0.1:4101`);
});

test('resolveInferenceGatewayProviderEndpoint encodes provider id', () => {
  const endpoint = resolveInferenceGatewayProviderEndpoint('seller/model+1', {
    BOSSRAID_INFERENCE_GATEWAY_BASE: 'https://gateway.example',
  });
  assert.equal(endpoint, 'https://gateway.example/gateway/seller%2Fmodel%2B1');
});

test('buildUpstreamSellerProviderId derives stable hosted provider ids', () => {
  const providerId = buildUpstreamSellerProviderId(
    'openai',
    '0xAbCdEf1234567890abcdef1234567890abcdef12',
    'gpt-4.1-mini'
  );
  assert.match(providerId, /^openai-seller-abcdef-/);
  assert.ok(providerId.length <= 96);
});

test('resolveHostedProviderUpstream reads venice_hosted upstream target', () => {
  const provider = createProviderProfile('hosted-venice', {
    source: {
      type: 'venice_hosted',
      externalRef: '0xSeller00000000000000000000000000000001',
    },
  });
  assert.equal(resolveHostedProviderUpstream(provider), 'venice');
  assert.equal(isHostedInferenceProvider(provider), true);
});

test('probeHostedInferenceProviderHealth reports missing upstream key as unreachable', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const provider = createProviderProfile('hosted-missing-key', {
    source: {
      type: 'venice_hosted',
      externalRef: '0xSeller00000000000000000000000000000002',
    },
    modelProvider: 'venice',
    modelId: 'llama-3.3-70b',
  });

  const health = probeHostedInferenceProviderHealth(controlState, provider);
  assert.equal(health.reachable, false);
  assert.equal(health.ready, false);
  assert.equal(health.statusCode, 503);
  assert.match(health.error ?? '', /API key is not configured/);
});

test('createProviderRunId returns unique run ids', () => {
  const first = createProviderRunId();
  const second = createProviderRunId();
  assert.match(first, /^run_/);
  assert.notEqual(first, second);
});

test('resolveInferenceGatewayBase uses localhost default port when unset', () => {
  const base = resolveInferenceGatewayBase({});
  assert.equal(base, `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_API_PORT}`);
});

test('runInferenceGatewayJob does not auto-verify behavioral privacy features from TEE validity', async () => {
  const wallet = '0xSeller00000000000000000000000000000001';
  const env = {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_MOCK: '1',
    BOSSRAID_VENICE_API_KEY: 'vn_test_key',
    NODE_ENV: 'test',
  };
  const controlState = createApiControlState(env);
  controlState.upsertSellerUpstreamConfig(wallet, 'venice', 'vn_test_key', env);

  const provider = createProviderProfile('hosted-privacy', {
    source: {
      type: 'venice_hosted',
      externalRef: wallet,
    },
    modelProvider: 'venice',
    modelId: 'llama-3.3-70b',
    privacy: {
      teeAttested: true,
      signedOutputs: true,
      noDataRetention: true,
      e2ee: false,
    },
  });

  const receiptDir = mkdtempSync(join(tmpdir(), 'bossraid-receipt-'));
  const inferenceReceiptStore = new InferenceReceiptStore(join(receiptDir, 'receipts.sqlite'));

  let captured: ProviderSubmission | undefined;
  const orchestrator = {
    recordProviderSubmission: async (_raidId: string, submission: ProviderSubmission) => {
      captured = submission;
    },
    recordProviderFailure: async () => undefined,
  };

  const taskPackage = {
    raidId: 'raid-gateway-privacy',
    submissionFormat: 'text_answer_plus_explanation' as const,
    desiredOutput: {
      primaryType: 'text' as const,
      artifactTypes: ['text' as const],
    },
    task: {
      title: 'Gateway privacy test',
      description: 'user: Say ok.',
      language: 'text' as const,
    },
    artifacts: {
      files: [],
      errors: [],
      reproSteps: [],
      tests: [],
    },
    constraints: {
      maxChangedFiles: 4,
      maxDiffLines: 250,
      forbidPaths: [],
      mustNot: [],
    },
    deadlineUnix: Math.floor(Date.now() / 1000) + 3600,
  };

  await runInferenceGatewayJob({
    orchestrator: orchestrator as never,
    controlState,
    inferenceReceiptStore,
    provider,
    body: {
      raidId: 'raid-gateway-privacy',
      providerId: provider.providerId,
      task: taskPackage,
      deadlineUnix: taskPackage.deadlineUnix,
    },
    providerRunId: 'run-gateway',
    env,
  });

  assert.ok(captured?.privacyAttestation);
  assert.ok(captured.privacyAttestation.featuresVerified.includes('tee_attested'));
  assert.equal(captured.privacyAttestation.featuresVerified.includes('signed_outputs'), false);
  assert.equal(captured.privacyAttestation.featuresVerified.includes('no_data_retention'), false);
});
