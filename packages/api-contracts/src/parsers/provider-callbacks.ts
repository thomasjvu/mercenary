import type {
  PrivacyAttestation,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderSubmission,
} from '@bossraid/shared-types';
import {
  ApiContractError,
  ensureBoolean,
  ensureNumber,
  ensureOptionalRecord,
  ensureOptionalString,
  ensureOutputType,
  ensurePrivacyFeatureArray,
  ensureRecord,
  ensureString,
  ensureStringArray,
} from '../validation.js';

export function parseProviderHeartbeat(value: unknown, providerId: string): ProviderHeartbeat {
  const input = ensureRecord(value, 'provider_heartbeat');
  return {
    raidId: ensureString(input.raidId, 'provider_heartbeat.raidId'),
    providerId,
    providerRunId: ensureString(input.providerRunId, 'provider_heartbeat.providerRunId'),
    progress: ensureNumber(input.progress, 'provider_heartbeat.progress'),
    message: ensureOptionalString(input.message, 'provider_heartbeat.message'),
    timestamp:
      ensureOptionalString(input.timestamp, 'provider_heartbeat.timestamp') ??
      new Date().toISOString(),
  };
}

export function parseProviderSubmission(value: unknown, providerId: string): ProviderSubmission {
  const input = ensureRecord(value, 'provider_submission');
  const patchUnifiedDiff =
    input.patchUnifiedDiff == null && input.patch_unified_diff == null
      ? undefined
      : ensureString(
          input.patchUnifiedDiff ?? input.patch_unified_diff,
          'provider_submission.patchUnifiedDiff'
        );
  const answerText =
    input.answerText == null && input.answer_text == null
      ? undefined
      : ensureString(input.answerText ?? input.answer_text, 'provider_submission.answerText');
  const artifacts =
    input.artifacts == null
      ? undefined
      : parseSubmissionArtifacts(input.artifacts, 'provider_submission.artifacts');

  if (!patchUnifiedDiff && !answerText && (!artifacts || artifacts.length === 0)) {
    throw new ApiContractError(
      'Expected patchUnifiedDiff, answerText, or artifacts for provider_submission.'
    );
  }

  return {
    raidId: ensureString(input.raidId, 'provider_submission.raidId'),
    providerId,
    providerRunId: ensureOptionalString(
      input.providerRunId ?? input.provider_run_id,
      'provider_submission.providerRunId'
    ),
    patchUnifiedDiff,
    answerText,
    artifacts,
    explanation: ensureString(input.explanation, 'provider_submission.explanation'),
    confidence: ensureNumber(input.confidence, 'provider_submission.confidence'),
    claimedRootCause: ensureOptionalString(
      input.claimedRootCause ?? input.claimed_root_cause,
      'provider_submission.claimedRootCause'
    ),
    contributionRole:
      input.contributionRole == null && input.contribution_role == null
        ? undefined
        : parseContributionRole(
            input.contributionRole ?? input.contribution_role,
            'provider_submission.contributionRole'
          ),
    filesTouched:
      input.filesTouched == null && input.files_touched == null
        ? []
        : ensureStringArray(
            input.filesTouched ?? input.files_touched,
            'provider_submission.filesTouched'
          ),
    submittedAt:
      ensureOptionalString(
        input.submittedAt ?? input.submitted_at,
        'provider_submission.submittedAt'
      ) ?? new Date().toISOString(),
    privacyAttestation:
      input.privacyAttestation == null && input.privacy_attestation == null
        ? undefined
        : parsePrivacyAttestation(
            input.privacyAttestation ?? input.privacy_attestation,
            'provider_submission.privacyAttestation'
          ),
  };
}

function parseSubmissionArtifacts(
  value: unknown,
  field: string
): NonNullable<ProviderSubmission['artifacts']> {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Expected array for ${field}.`);
  }

  return value.map((item, index) => {
    const input = ensureRecord(item, `${field}[${index}]`);
    return {
      outputType: ensureOutputType(
        input.outputType ?? input.output_type,
        `${field}[${index}].outputType`
      ),
      label: ensureString(input.label, `${field}[${index}].label`),
      uri: ensureString(input.uri, `${field}[${index}].uri`),
      mimeType: ensureOptionalString(
        input.mimeType ?? input.mime_type,
        `${field}[${index}].mimeType`
      ),
      description: ensureOptionalString(input.description, `${field}[${index}].description`),
      sha256: ensureOptionalString(input.sha256, `${field}[${index}].sha256`),
    };
  });
}

function parseContributionRole(
  value: unknown,
  field: string
): NonNullable<ProviderSubmission['contributionRole']> {
  const input = ensureRecord(value, field);

  return {
    id: ensureString(input.id, `${field}.id`),
    label: ensureString(input.label, `${field}.label`),
    objective: ensureOptionalString(input.objective, `${field}.objective`),
    workstreamId: ensureOptionalString(
      input.workstreamId ?? input.workstream_id,
      `${field}.workstreamId`
    ),
    workstreamLabel: ensureOptionalString(
      input.workstreamLabel ?? input.workstream_label,
      `${field}.workstreamLabel`
    ),
    workstreamObjective: ensureOptionalString(
      input.workstreamObjective ?? input.workstream_objective,
      `${field}.workstreamObjective`
    ),
  };
}

function parsePrivacyAttestation(value: unknown, field: string): PrivacyAttestation {
  const input = ensureRecord(value, field);
  const teeInput = ensureOptionalRecord(
    input.teeAttestation ?? input.tee_attestation,
    `${field}.teeAttestation`
  );

  return {
    providerId: ensureString(input.providerId ?? input.provider_id, `${field}.providerId`),
    raidId: ensureString(input.raidId ?? input.raid_id, `${field}.raidId`),
    submittedAt: ensureString(input.submittedAt ?? input.submitted_at, `${field}.submittedAt`),
    featuresClaimed: ensurePrivacyFeatureArray(
      input.featuresClaimed ?? input.features_claimed,
      `${field}.featuresClaimed`
    ),
    featuresVerified: ensurePrivacyFeatureArray(
      input.featuresVerified ?? input.features_verified,
      `${field}.featuresVerified`
    ),
    teeAttestation: teeInput
      ? {
          valid: ensureBoolean(teeInput.valid, `${field}.teeAttestation.valid`),
          providerId: ensureString(
            teeInput.providerId ?? teeInput.provider_id,
            `${field}.teeAttestation.providerId`
          ),
          verifiedAt: ensureString(
            teeInput.verifiedAt ?? teeInput.verified_at,
            `${field}.teeAttestation.verifiedAt`
          ),
          expiresAt: ensureOptionalString(
            teeInput.expiresAt ?? teeInput.expires_at,
            `${field}.teeAttestation.expiresAt`
          ),
          vendor: ensureString(teeInput.vendor, `${field}.teeAttestation.vendor`),
          enclaveHash: ensureOptionalString(
            teeInput.enclaveHash ?? teeInput.enclave_hash,
            `${field}.teeAttestation.enclaveHash`
          ),
          signature: ensureOptionalString(teeInput.signature, `${field}.teeAttestation.signature`),
          runtimeMode: ensureOptionalString(
            teeInput.runtimeMode ?? teeInput.runtime_mode,
            `${field}.teeAttestation.runtimeMode`
          ),
          notes:
            teeInput.notes == null
              ? undefined
              : ensureStringArray(teeInput.notes, `${field}.teeAttestation.notes`),
        }
      : undefined,
    externalApiCalls:
      input.externalApiCalls == null && input.external_api_calls == null
        ? []
        : ensureStringArray(
            input.externalApiCalls ?? input.external_api_calls,
            `${field}.externalApiCalls`
          ),
    dataRetained: ensureBoolean(input.dataRetained ?? input.data_retained, `${field}.dataRetained`),
    signedDeclaration: ensureString(
      input.signedDeclaration ?? input.signed_declaration,
      `${field}.signedDeclaration`
    ),
  };
}

export function parseProviderFailure(value: unknown, providerId: string): ProviderFailure {
  const input = ensureRecord(value, 'provider_failure');
  return {
    raidId: ensureString(input.raidId, 'provider_failure.raidId'),
    providerId,
    providerRunId: ensureOptionalString(input.providerRunId, 'provider_failure.providerRunId'),
    message: ensureString(input.message, 'provider_failure.message'),
    failedAt:
      ensureOptionalString(input.failedAt, 'provider_failure.failedAt') ?? new Date().toISOString(),
  };
}
