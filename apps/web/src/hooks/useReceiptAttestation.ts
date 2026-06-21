import type { AttestedEnvelope, AttestedRaidResultPayload } from '../api';
import type { HostAttestationResponse } from '../api/host-attestation.js';
import {
  buildAttestationSurfaceLabel,
  isAttestationSignerUnavailable,
  type ReceiptQuery,
} from '../lib/receipt-url';
import { deriveHostAttestationStatus } from '../lib/runtime-attestation-status.js';

type HostAttestationSource = {
  data?: HostAttestationResponse;
  error?: { message?: string };
};

type ResultAttestationSource = {
  data?: AttestedEnvelope<AttestedRaidResultPayload>;
  error?: { message?: string };
};

export function useReceiptAttestation({
  hostAttestation,
  attestedResult,
  activeQuery,
}: {
  hostAttestation: HostAttestationSource;
  attestedResult: ResultAttestationSource;
  activeQuery: ReceiptQuery | null;
}) {
  const tee = hostAttestation.data?.teeAttestation;
  const signedRuntime = hostAttestation.data?.signedRuntime;
  const hostStatus = deriveHostAttestationStatus({
    data: hostAttestation.data,
    error: hostAttestation.error?.message,
  });
  const hostVerified = hostStatus.status === 'live';
  const runtimeSignerDisabled = hostStatus.signerDisabled;
  const resultSignerDisabled = isAttestationSignerUnavailable(attestedResult.error?.message);

  const runtimeAttestationStatus = hostVerified
    ? 'live'
    : runtimeSignerDisabled
      ? 'tee quote live'
      : hostAttestation.error
        ? 'unavailable'
        : hostAttestation.data
          ? 'pending'
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
    hostAttestation.data?.deploymentTarget ??
    signedRuntime?.payload.deploymentTarget ??
    attestedResult.data?.payload.deploymentTarget ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'not published' : 'pending');

  const attestationTee =
    hostAttestation.data?.teePlatform ??
    tee?.vendor ??
    signedRuntime?.payload.teePlatform ??
    attestedResult.data?.payload.teePlatform ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'provider TEE live' : 'pending');

  const attestationSurfaceLabel =
    hostVerified || attestedResult.data
      ? buildAttestationSurfaceLabel(attestationTarget, attestationTee)
      : runtimeSignerDisabled || resultSignerDisabled
        ? 'Host proof via TEE quote'
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
