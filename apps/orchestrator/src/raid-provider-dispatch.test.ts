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

  const raid = createRaidRecord(sanitized, { primaries: [provider], reserves: [] });
  for (const providerId of raid.selectedProviders) {
    const assignment = raid.assignments[providerId];
    if (assignment) {
      assignment.providerRunId = 'run-strict-privacy';
      assignment.status = 'running';
    }
  }
  return raid;
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

test('submitResult rejects self-asserted privacy attestation when server verify is enabled', async () => {
  const previous = process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
  process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = '1';

  try {
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
    assert.equal(ranked.breakdown.valid, false);
    assert.ok(ranked.breakdown.invalidReasons.includes('privacy_non_compliant'));
    assert.equal(ranked.breakdown.privacyComplianceDetails?.passed, false);
    assert.deepEqual(ranked.submission.privacyAttestation?.featuresVerified, []);
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
    } else {
      process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = previous;
    }
  }
});

test('submitResult keeps compliant strict privacy submissions eligible when server verify is disabled', async () => {
  const previous = process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
  process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = '0';

  try {
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
    assert.deepEqual(ranked.submission.privacyAttestation?.featuresVerified, [
      'tee_attested',
      'e2ee',
    ]);
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
    } else {
      process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = previous;
    }
  }
});

for (const status of [
  'selected',
  'invited',
  'submitted',
  'invalid',
  'timed_out',
  'failed',
  'disqualified',
  'paid',
] as const) {
  test(`submitResult ignores ${status} assignments`, async () => {
    const raid = createStrictPrivacyRaid();
    const providerId = raid.selectedProviders[0]!;
    raid.assignments[providerId]!.status = status;
    const before = structuredClone(raid);
    const deps = createDispatchDeps(raid);
    deps.applyReputationEvent = () => assert.fail('unexpected reputation event');
    deps.clearProviderTimers = () => assert.fail('unexpected timer mutation');
    await submitResult(raid.id, createSubmission(raid.id, providerId), deps);
    assert.deepEqual(raid, before);
  });
}

for (const transition of ['cancelled', 'final', 'timed_out', 'run_replaced', 'deadline'] as const) {
  test(`submitResult discards evaluation after ${transition}`, async () => {
    const raid = createStrictPrivacyRaid();
    const providerId = raid.selectedProviders[0]!;
    const deps = createDispatchDeps(raid);
    deps.applyReputationEvent = () => assert.fail('unexpected reputation event');
    deps.clearProviderTimers = () => assert.fail('unexpected timer mutation');
    const pending = submitResult(raid.id, createSubmission(raid.id, providerId), deps);
    if (transition === 'cancelled' || transition === 'final') {
      raid.status = transition;
    } else if (transition === 'timed_out') {
      raid.assignments[providerId]!.status = 'timed_out';
    } else if (transition === 'run_replaced') {
      raid.assignments[providerId]!.providerRunId = 'replacement-run';
    } else {
      deps.raidDeadlineReached = () => true;
    }
    const before = structuredClone(raid);
    await pending;
    assert.deepEqual(raid, before);
  });
}

test('concurrent submissions commit one result and one reputation event', async () => {
  const raid = createStrictPrivacyRaid();
  const providerId = raid.selectedProviders[0]!;
  const deps = createDispatchDeps(raid);
  let events = 0;
  deps.applyReputationEvent = () => {
    events += 1;
  };
  await Promise.all([
    submitResult(raid.id, createSubmission(raid.id, providerId), deps),
    submitResult(
      raid.id,
      { ...createSubmission(raid.id, providerId), answerText: 'Another answer.' },
      deps
    ),
  ]);
  assert.equal(raid.rankedSubmissions.length, 1);
  assert.equal(events, 1);
});
