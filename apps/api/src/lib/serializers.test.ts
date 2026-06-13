import assert from 'node:assert/strict';
import test from 'node:test';
import type { BossRaidResultOutput, RankedSubmission } from '@bossraid/shared-types';
import { serializeRaidResult } from './serializers.js';

function buildRankedSubmission(providerId: string): RankedSubmission {
  return {
    rank: 1,
    breakdown: {
      schemaPass: true,
      patchApplyPass: true,
      buildScore: 1,
      testScore: 1,
      heuristicScore: 1,
      correctnessRubric: 1,
      sideEffectSafety: 1,
      explanationScore: 1,
      latencyScore: 1,
      uniquenessScore: 1,
      finalScore: 1,
      valid: true,
      invalidReasons: [],
    },
    submission: {
      providerId,
      raidId: 'raid-1',
      providerRunId: 'run-1',
      explanation: 'ok',
      confidence: 0.9,
      filesTouched: [],
      submittedAt: '2026-06-12T00:00:00.000Z',
      privacyAttestation: {
        providerId,
        raidId: 'raid-1',
        submittedAt: '2026-06-12T00:00:00.000Z',
        featuresClaimed: ['tee_attested', 'e2ee'],
        featuresVerified: ['tee_attested'],
        teeAttestation: {
          valid: true,
          providerId,
          verifiedAt: '2026-06-12T00:00:00.000Z',
          vendor: 'venice',
          upstreamVendor: 'venice',
          signingAddress: '0xabc',
          e2eeReady: true,
          explorerUrl: 'https://proof.t16z.com/example',
          checks: [{ id: 'signature', passed: true, detail: 'signature valid' }],
        },
        externalApiCalls: ['venice:chat/completions'],
        dataRetained: false,
        signedDeclaration: 'PRIVACY_DECLARATION:test',
        inferenceReceiptId: 'inf_rcpt_test_1',
      },
    },
  };
}

test('serializeRaidResult exposes privacy attestation on submissions and settlement', () => {
  const ranked = buildRankedSubmission('provider-tee');
  const result: BossRaidResultOutput = {
    raidId: 'raid-1',
    status: 'final',
    approvedSubmissions: [ranked],
    settlementExecution: {
      mode: 'file',
      proofStandard: 'erc8183_aligned',
      lifecycleStatus: 'synthetic',
      executedAt: '2026-06-12T00:00:00.000Z',
      artifactPath: '/tmp/settlement.json',
      registryRaidRef: '1',
      taskHash: '0xtask',
      evaluationHash: '0xeval',
      successfulProviderIds: ['provider-tee'],
      privacyCompliance: {
        raidId: 'raid-1',
        privacyMode: 'strict',
        requiredFeatures: ['tee_attested'],
        providerAttestations: [ranked.submission.privacyAttestation!],
        perProviderCompliance: {
          'provider-tee': {
            passed: true,
            score: 100,
            dataLineageLeak: false,
            redactedContentReexposed: false,
            externalTransmissionDetected: false,
            issues: [],
          },
        },
        overallPassed: true,
        overallScore: 100,
        evaluatedAt: '2026-06-12T00:00:00.000Z',
      },
      allocations: [],
      contracts: {
        registryAddress: null,
        escrowAddress: null,
        tokenAddress: null,
        clientAddress: null,
        evaluatorAddress: null,
        chainId: null,
      },
      registryCall: {
        method: 'finalizeRaid',
        args: ['1', '0xeval'],
      },
      childJobs: [],
    },
  };

  const serialized = serializeRaidResult(result);
  const attestation = serialized.approvedSubmissions?.[0]?.submission.privacyAttestation;

  assert.ok(attestation);
  assert.equal(attestation.teeAttestation?.signingAddress, '0xabc');
  assert.equal(attestation.teeAttestation?.explorerUrl, 'https://proof.t16z.com/example');
  assert.equal(attestation.inferenceReceiptId, 'inf_rcpt_test_1');
  assert.deepEqual(attestation.featuresClaimed, ['tee_attested', 'e2ee']);
  assert.equal(serialized.settlementExecution?.privacyCompliance?.overallPassed, true);
  assert.equal(
    serialized.settlementExecution?.privacyCompliance?.providerAttestations[0]?.providerId,
    'provider-tee'
  );
});
