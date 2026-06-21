import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderSubmission } from '@bossraid/shared-types';
import { buildPrivacyAttestation } from './attestation.js';
import { verifySubmissionPrivacyAttestation } from './verify-submission-attestation.js';

function createSubmission(
  attestation: ProviderSubmission['privacyAttestation']
): ProviderSubmission {
  return {
    raidId: 'raid-verify',
    providerId: 'provider-verify',
    providerRunId: 'run-verify',
    answerText: 'answer',
    explanation: 'explanation',
    confidence: 0.9,
    filesTouched: [],
    submittedAt: new Date().toISOString(),
    privacyAttestation: attestation,
  };
}

test('verifySubmissionPrivacyAttestation rejects forged tee validity', async () => {
  const previous = process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
  process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = '1';

  try {
    const submission = createSubmission({
      providerId: 'provider-verify',
      raidId: 'raid-verify',
      submittedAt: new Date().toISOString(),
      featuresClaimed: ['tee_attested'],
      featuresVerified: ['tee_attested'],
      externalApiCalls: [],
      dataRetained: false,
      signedDeclaration: 'PRIVACY_DECLARATION:forged',
      teeAttestation: {
        valid: true,
        providerId: 'provider-verify',
        verifiedAt: new Date().toISOString(),
        vendor: 'phala',
        signature: 'forged-quote',
      },
    });

    const result = await verifySubmissionPrivacyAttestation({
      submission,
      verifyTeeFn: async () => ({
        valid: false,
        providerId: 'provider-verify',
        verifiedAt: new Date().toISOString(),
        vendor: 'phala',
      }),
    });

    assert.ok(result.errors.some((issue) => issue.code === 'TEE_VALIDITY_MISMATCH'));
    assert.ok(result.errors.some((issue) => issue.code === 'FEATURE_OVERCLAIMED'));
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
    } else {
      process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = previous;
    }
  }
});

test('verifySubmissionPrivacyAttestation accepts server-aligned attestation', async () => {
  const previous = process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
  process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = '1';

  try {
    const teeResult = {
      valid: true,
      providerId: 'provider-verify',
      verifiedAt: '2026-06-20T00:00:00.000Z',
      vendor: 'phala' as const,
      signature: 'server-quote',
    };
    const attestation = buildPrivacyAttestation({
      providerId: 'provider-verify',
      raidId: 'raid-verify',
      featuresClaimed: ['tee_attested'],
      featuresVerified: ['tee_attested'],
      teeAttestation: teeResult,
    });
    const submission = createSubmission(attestation);

    const result = await verifySubmissionPrivacyAttestation({
      submission,
      verifyTeeFn: async () => teeResult,
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.attestation?.featuresVerified.join(','), 'tee_attested');
    assert.equal(result.attestation?.signedDeclaration, attestation.signedDeclaration);
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
    } else {
      process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = previous;
    }
  }
});

test('verifySubmissionPrivacyAttestation skips server verify when disabled', async () => {
  const previous = process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
  process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = '0';

  try {
    const submission = createSubmission({
      providerId: 'provider-verify',
      raidId: 'raid-verify',
      submittedAt: new Date().toISOString(),
      featuresClaimed: ['tee_attested', 'e2ee'],
      featuresVerified: ['tee_attested', 'e2ee'],
      externalApiCalls: [],
      dataRetained: false,
      signedDeclaration: 'PRIVACY_DECLARATION:client-only',
      teeAttestation: {
        valid: true,
        providerId: 'provider-verify',
        verifiedAt: new Date().toISOString(),
        vendor: 'phala',
      },
    });

    const result = await verifySubmissionPrivacyAttestation({ submission });
    assert.equal(result.errors.length, 0);
    assert.equal(result.attestation?.signedDeclaration, 'PRIVACY_DECLARATION:client-only');
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_PRIVACY_SERVER_VERIFY;
    } else {
      process.env.BOSSRAID_PRIVACY_SERVER_VERIFY = previous;
    }
  }
});
