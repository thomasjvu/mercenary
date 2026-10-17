import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import { buildProviderVerificationFromHealth } from './provider-verification.js';

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

test('buildProviderVerificationFromHealth fails on framework mismatch', () => {
  const verification = buildProviderVerificationFromHealth(
    buildProvider({ agentFramework: 'codex' }),
    buildHealth({ agentFramework: 'custom' })
  );

  assert.equal(verification.status, 'failed');
  assert.equal(verification.frameworkVerified, false);
  assert.match((verification.notes ?? []).join(','), /framework_mismatch/);
});
