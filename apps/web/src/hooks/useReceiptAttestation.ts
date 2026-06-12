import type { AttestedEnvelope, AttestedRaidResultPayload, AttestedRuntimePayload } from '../api';
import {
  buildAttestationSurfaceLabel,
  isAttestationSignerUnavailable,
  type ReceiptQuery,
} from '../lib/receipt-url';

type AttestationSource = {
  data?: AttestedEnvelope<AttestedRuntimePayload | AttestedRaidResultPayload>;
  error?: { message?: string };
};

export function useReceiptAttestation({
  attestedRuntime,
  attestedResult,
  activeQuery,
}: {
  attestedRuntime: AttestationSource;
  attestedResult: AttestationSource;
  activeQuery: ReceiptQuery | null;
}) {
  const runtimeSignerDisabled = isAttestationSignerUnavailable(attestedRuntime.error?.message);
  const resultSignerDisabled = isAttestationSignerUnavailable(attestedResult.error?.message);
  const runtimeAttestationStatus = attestedRuntime.data
    ? 'live'
    : runtimeSignerDisabled
      ? 'proof unpublished'
      : attestedRuntime.error
        ? 'unavailable'
        : 'loading';
  const resultAttestationStatus = attestedResult.data
    ? 'live'
    : resultSignerDisabled
      ? 'proof unpublished'
      : attestedResult.error
        ? 'unavailable'
        : activeQuery
          ? 'loading'
          : 'pending';
  const attestationTarget =
    attestedResult.data?.payload.deploymentTarget ??
    attestedRuntime.data?.payload.deploymentTarget ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'not published' : 'pending');
  const attestationTee =
    attestedResult.data?.payload.teePlatform ??
    attestedRuntime.data?.payload.teePlatform ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'provider TEE live' : 'pending');
  const attestationSurfaceLabel =
    attestedResult.data || attestedRuntime.data
      ? buildAttestationSurfaceLabel(attestationTarget, attestationTee)
      : runtimeSignerDisabled || resultSignerDisabled
        ? 'Host proof unpublished'
        : buildAttestationSurfaceLabel(attestationTarget, attestationTee);

  return {
    runtimeSignerDisabled,
    resultSignerDisabled,
    runtimeAttestationStatus,
    resultAttestationStatus,
    attestationTarget,
    attestationTee,
    attestationSurfaceLabel,
  };
}
