import assert from 'node:assert/strict';
import test from 'node:test';
import { createRaidRecord, sanitizeTask } from '@bossraid/raid-core';
import type { ProviderSubmission, RaidRecord } from '@bossraid/shared-types';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import { ProviderTimerRegistry } from './timer-registry.js';
import { submitResult, type RaidProviderDispatchDeps } from './raid-provider-dispatch.js';

function createStrictPrivacyRaid(): RaidRecord {
  const input = createSpawnInput();
  const sanitized = sanitizeTask({
    ...input,
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      ...input.constraints,
      numExperts: 1,
      allowedOutputTypes: ['text'],
      privacyMode: 'strict',
      requirePrivacyFeatures: ['tee_attested', 'e2ee'],
    },
  });
  const provider = createProviderProfile('provider-strict', {
    privacy: {
      teeAttested: true,
      e2ee: true,
      signedOutputs: true,
      noDataRetention: true,
    },
  });

  return createRaidRecord(sanitized, { primaries: [provider], reserves: [] });
}

function createDispatchDeps(raid: RaidRecord): RaidProviderDispatchDeps {
  return {
    requireRaid: () => raid,
    getProvider: () => undefined,
    getProviderRuntime: () => undefined,
    updateProviderProfile: () => undefined,
    options: {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      heartbeatStaleMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 60_000,
      providerFreshMs: 60_000,
    },
    timers: new ProviderTimerRegistry(),
    clearProviderTimers: () => undefined,
    queuePersistBestEffort: () => undefined,
    raidDeadlineReached: () => false,
    expireRaidAtDeadline: () => undefined,
    scheduleRaidDeadline: () => undefined,
    refreshRaidAncestry: () => undefined,
    maybeFinalizeAfterUpdate: () => undefined,
    applyReputationEvent: () => undefined,
    applyProviderRoutingCooldown: () => undefined,
    finalizeRaid: () => undefined,
    maybeReplanHierarchicalRaid: () => false,
    shouldFinalizeHierarchicalRaid: () => false,
    waitForFinalization: async () => undefined,
  };
}

function createSubmission(raidId: string, providerId: string): ProviderSubmission {
  return {
    raidId,
    providerId,
    providerRunId: 'run-strict-privacy',
    answerText: 'Strict privacy answer.',
    explanation: 'Submitted without verified privacy attestation.',
    confidence: 0.9,
    filesTouched: [],
    submittedAt: new Date().toISOString(),
  };
}

test('submitResult fails closed for strict privacy when submission is non-compliant', async () => {
  const raid = createStrictPrivacyRaid();
  const deps = createDispatchDeps(raid);

  await submitResult(raid.id, createSubmission(raid.id, raid.selectedProviders[0]!), deps);

  const ranked = raid.rankedSubmissions[0];
  assert.ok(ranked);
  assert.equal(ranked.breakdown.valid, false);
  assert.ok(ranked.breakdown.invalidReasons.includes('privacy_non_compliant'));
  assert.equal(ranked.breakdown.privacyComplianceDetails?.passed, false);
  assert.equal(raid.synthesizedOutput, undefined);
  assert.equal(raid.assignments[raid.selectedProviders[0]!]?.status, 'invalid');
});

test('submitResult keeps compliant strict privacy submissions eligible for synthesis', async () => {
  const raid = createStrictPrivacyRaid();
  const deps = createDispatchDeps(raid);
  const providerId = raid.selectedProviders[0]!;

  await submitResult(
    raid.id,
    {
      ...createSubmission(raid.id, providerId),
      privacyAttestation: {
        providerId,
        raidId: raid.id,
        submittedAt: new Date().toISOString(),
        featuresClaimed: ['tee_attested', 'e2ee'],
        featuresVerified: ['tee_attested', 'e2ee'],
        externalApiCalls: [],
        dataRetained: false,
        signedDeclaration: 'PRIVACY_DECLARATION:test',
        teeAttestation: {
          valid: true,
          providerId,
          verifiedAt: new Date().toISOString(),
          vendor: 'venice',
          e2eeReady: true,
        },
      },
    },
    deps
  );

  const ranked = raid.rankedSubmissions[0];
  assert.ok(ranked);
  assert.equal(ranked.breakdown.privacyComplianceDetails?.passed, true);
  assert.equal(ranked.breakdown.invalidReasons.includes('privacy_non_compliant'), false);
});
