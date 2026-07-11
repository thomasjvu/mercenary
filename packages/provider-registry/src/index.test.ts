import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePrivacyScore,
  computeTrustScore,
  providerMatchesHarnessConstraints,
  resolveHarnessProfile,
} from './index.js';
import type { ProviderProfile } from '@bossraid/shared-types';

function baseProvider(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    providerId: 'p1',
    displayName: 'P1',
    endpointType: 'http',
    endpoint: 'https://seller.example.com',
    specializations: [],
    supportedLanguages: ['text'],
    supportedFrameworks: [],
    pricePerTaskUsd: 1,
    maxConcurrency: 1,
    status: 'available',
    reputation: {
      globalScore: 0.5,
      responsivenessScore: 0.5,
      validityScore: 0.5,
      qualityScore: 0.5,
      timeoutRate: 0,
      duplicateRate: 0,
      specializationScores: {},
      p50LatencyMs: 1000,
      p95LatencyMs: 2000,
      totalRaids: 0,
      totalSuccessfulRaids: 0,
    },
    ...overrides,
  };
}

test('computePrivacyScore ignores client-supplied privacy.score', () => {
  assert.equal(computePrivacyScore({ score: 99 }), 0);
  assert.equal(computePrivacyScore({ score: 99, teeAttested: true, e2ee: true }), 60);
});

test('computeTrustScore ignores client-supplied trust.score', () => {
  const withFakeScore = baseProvider({
    trust: { score: 100, source: 'erc8004' },
  });
  assert.equal(computeTrustScore(withFakeScore), 0);

  const withIdentity = baseProvider({
    trust: { score: 1 },
    erc8004: {
      agentId: 'agent-1',
      registrationTx: '0xabc',
      operatorWallet: '0x1',
      identityRegistry: '0x2',
    },
  });
  assert.ok(computeTrustScore(withIdentity) >= 45);
  assert.ok(computeTrustScore(withIdentity) < 100 || computeTrustScore(withIdentity) === 100);
});

test('providerMatchesHarnessConstraints filters by installation and skills', () => {
  const fresh = baseProvider({
    harnessProfile: {
      lane: 'agent_harness',
      installation: 'fresh',
      skills: [],
    },
  });
  const skilled = baseProvider({
    harnessProfile: {
      lane: 'agent_harness',
      installation: 'skill_augmented',
      skills: [{ id: 'unity-debug' }, { id: 'patch-hygiene' }],
    },
  });

  assert.equal(providerMatchesHarnessConstraints(fresh, { allowedInstallations: ['fresh'] }), true);
  assert.equal(
    providerMatchesHarnessConstraints(skilled, { allowedInstallations: ['fresh'] }),
    false
  );
  assert.equal(
    providerMatchesHarnessConstraints(skilled, { requiredSkills: ['unity-debug'] }),
    true
  );
  assert.equal(
    providerMatchesHarnessConstraints(skilled, { requiredSkills: ['missing-skill'] }),
    false
  );
  assert.equal(resolveHarnessProfile(baseProvider()).lane, 'api_chat');
  assert.equal(resolveHarnessProfile(baseProvider()).installation, 'fresh');
});
