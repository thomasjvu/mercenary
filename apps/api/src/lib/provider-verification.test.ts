import assert from 'node:assert/strict';
import test from 'node:test';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import {
  buildProviderVerificationFromHealth,
  verifyProviderFromHealth,
} from './provider-verification.js';

function buildProvider(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    providerId: 'provider-1',
    agentId: 'agent-1',
    displayName: 'Test Provider',
    endpointType: 'http',
    endpoint: 'http://127.0.0.1:9001',
    specializations: ['text'],
    supportedLanguages: ['typescript'],
    supportedFrameworks: ['custom'],
    outputTypes: ['text'],
    pricePerTaskUsd: 1,
    maxConcurrency: 1,
    status: 'available',
    ...overrides,
  } as ProviderProfile;
}

function buildHealth(overrides: Partial<ProviderHealthStatus> = {}): ProviderHealthStatus {
  return {
    providerId: 'provider-1',
    providerName: 'Test Provider',
    endpoint: 'http://127.0.0.1:9001',
    reachable: true,
    ready: true,
    statusCode: 200,
    agentFramework: 'custom',
    modelProvider: 'venice',
    model: 'model-a',
    ...overrides,
  };
}

test('buildProviderVerificationFromHealth marks matching health as verified', () => {
  const verification = buildProviderVerificationFromHealth(
    buildProvider({
      agentFramework: 'custom',
      modelProvider: 'venice',
      modelId: 'model-a',
    }),
    buildHealth()
  );

  assert.equal(verification.status, 'verified');
  assert.equal(verification.apiVerified, true);
  assert.equal(verification.frameworkVerified, true);
  assert.equal(verification.modelVerified, true);
});

test('buildProviderVerificationFromHealth fails on framework mismatch', () => {
  const verification = buildProviderVerificationFromHealth(
    buildProvider({ agentFramework: 'codex' }),
    buildHealth({ agentFramework: 'custom' })
  );

  assert.equal(verification.status, 'failed');
  assert.equal(verification.frameworkVerified, false);
  assert.match((verification.notes ?? []).join(','), /framework_mismatch/);
});

test('verifyProviderFromHealth upserts provider with verification payload', async () => {
  const provider = buildProvider();
  const health = buildHealth();
  let upsertInput: unknown;

  const orchestrator = {
    async upsertRegisteredProvider(input: unknown) {
      upsertInput = input;
      return {
        ...provider,
        verification: buildProviderVerificationFromHealth(provider, health),
      };
    },
  } as unknown as BossRaidOrchestrator;

  const verified = await verifyProviderFromHealth(orchestrator, provider, health);

  assert.equal(verified.verification?.status, 'verified');
  assert.equal(
    (upsertInput as { verification?: { status?: string } }).verification?.status,
    'verified'
  );
});
