import { readTeeSocketPath } from '@bossraid/constants';
import type {
  PrivacyAttestation,
  PrivacyFeatureKey,
  ProviderSubmission,
} from '@bossraid/shared-types';
import {
  buildPrivacyAttestation,
  verifyPhalaTeeAttestation,
  type PhalaTeeAttestationOptions,
} from './attestation.js';

const DEFAULT_PROVIDER_TEE_CACHE_TTL_MS = 10 * 60 * 1000;

const providerTeeCache = new Map<
  string,
  { result: Awaited<ReturnType<typeof verifyPhalaTeeAttestation>>; expiresAt: number }
>();

export type VerifySubmissionAttestationIssue = {
  code: string;
  message: string;
};

export interface VerifySubmissionPrivacyAttestationInput {
  submission: ProviderSubmission;
  teeSocketPath?: string;
  skipServerVerify?: boolean;
  verifyTeeFn?: typeof verifyPhalaTeeAttestation;
}

export interface VerifySubmissionPrivacyAttestationResult {
  attestation: PrivacyAttestation | undefined;
  errors: VerifySubmissionAttestationIssue[];
  warnings: VerifySubmissionAttestationIssue[];
}

function isServerVerifyEnabled(): boolean {
  return process.env.BOSSRAID_PRIVACY_SERVER_VERIFY !== '0';
}

function deriveServerFeaturesVerified(teeValid: boolean): PrivacyFeatureKey[] {
  return teeValid ? ['tee_attested'] : [];
}

export async function verifySubmissionPrivacyAttestation(
  input: VerifySubmissionPrivacyAttestationInput
): Promise<VerifySubmissionPrivacyAttestationResult> {
  const attestation = input.submission.privacyAttestation;
  if (!attestation) {
    return { attestation: undefined, errors: [], warnings: [] };
  }

  const errors: VerifySubmissionAttestationIssue[] = [];
  const warnings: VerifySubmissionAttestationIssue[] = [];

  if (attestation.providerId !== input.submission.providerId) {
    errors.push({
      code: 'ATTESTATION_PROVIDER_MISMATCH',
      message: `Privacy attestation providerId ${attestation.providerId} does not match submission provider ${input.submission.providerId}.`,
    });
  }
  if (attestation.raidId !== input.submission.raidId) {
    errors.push({
      code: 'ATTESTATION_RAID_MISMATCH',
      message: `Privacy attestation raidId ${attestation.raidId} does not match submission raid ${input.submission.raidId}.`,
    });
  }

  if (!isServerVerifyEnabled() || input.skipServerVerify) {
    return { attestation, errors, warnings };
  }

  const providerId = input.submission.providerId;
  const raidId = input.submission.raidId;
  const socketPath = input.teeSocketPath ?? readTeeSocketPath(process.env);
  const verifyTee = input.verifyTeeFn ?? verifyPhalaTeeAttestation;
  const teeOptions: PhalaTeeAttestationOptions = {
    reportData: JSON.stringify({ providerId, raidId }),
    runtimeMode: process.env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm-gpu',
    skipCloudVerify: process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1',
  };

  const teeResult = await verifyTee(
    providerId,
    socketPath,
    providerTeeCache,
    DEFAULT_PROVIDER_TEE_CACHE_TTL_MS,
    teeOptions
  );

  if (attestation.teeAttestation?.valid !== teeResult.valid) {
    errors.push({
      code: 'TEE_VALIDITY_MISMATCH',
      message: `Client attestation reported tee valid=${String(attestation.teeAttestation?.valid)} but server verification returned valid=${String(teeResult.valid)}.`,
    });
  }

  const clientSignature = attestation.teeAttestation?.signature;
  const serverSignature = teeResult.signature;
  if (clientSignature && serverSignature && clientSignature !== serverSignature) {
    errors.push({
      code: 'TEE_SIGNATURE_MISMATCH',
      message: 'Client TEE quote signature does not match server-verified quote.',
    });
  }

  const featuresVerified = deriveServerFeaturesVerified(teeResult.valid);
  const serverAttestation = buildPrivacyAttestation({
    providerId,
    raidId,
    featuresClaimed: attestation.featuresClaimed,
    featuresVerified,
    teeAttestation: teeResult,
    externalApiCalls: attestation.externalApiCalls,
    dataRetained: attestation.dataRetained,
  });

  if (attestation.signedDeclaration !== serverAttestation.signedDeclaration) {
    errors.push({
      code: 'DECLARATION_MISMATCH',
      message: 'Client signedDeclaration does not match server-recomputed declaration.',
    });
  }

  for (const feature of attestation.featuresVerified) {
    if (!featuresVerified.includes(feature)) {
      errors.push({
        code: 'FEATURE_OVERCLAIMED',
        message: `Client marked privacy feature '${feature}' verified without server proof.`,
      });
    }
  }

  return {
    attestation: serverAttestation,
    errors,
    warnings,
  };
}
