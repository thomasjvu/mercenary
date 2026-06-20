import type { HostAttestationResponse } from '../api/host-attestation.js';
import { buildRuntimeAttestationLabel } from '../mercenary-result.js';
import type { SpecialistTone } from '../components/mercenary/mercenary-ui';

export function deriveHostAttestationStatus(input: {
  data: HostAttestationResponse | null | undefined;
  error: string | null | undefined;
}): {
  signerDisabled: boolean;
  status: string;
  tone: SpecialistTone;
  label: string;
  target: string;
  tee: string;
} {
  const teeAttestation = input.data?.teeAttestation;
  const signedRuntime = input.data?.signedRuntime;
  const verified = Boolean(input.data?.verified && (teeAttestation?.valid || signedRuntime));
  const signerDisabled = Boolean(signedRuntime) === false && Boolean(teeAttestation?.valid);

  const status = verified
    ? 'live'
    : teeAttestation && !teeAttestation.valid
      ? 'unverified'
      : input.error
        ? 'unavailable'
        : input.data
          ? 'pending'
          : 'loading';

  const target =
    input.data?.deploymentTarget ??
    teeAttestation?.runtimeMode ??
    (signerDisabled ? 'phala host' : 'pending');
  const tee =
    input.data?.teePlatform ?? teeAttestation?.vendor ?? (signerDisabled ? 'phala' : 'pending');

  const label = verified
    ? buildRuntimeAttestationLabel(target, tee)
    : teeAttestation?.valid === false
      ? 'TEE quote unverified'
      : buildRuntimeAttestationLabel(target, tee);

  const tone: SpecialistTone = verified
    ? 'ready'
    : teeAttestation?.valid === false
      ? 'offline'
      : input.error
        ? 'offline'
        : input.data
          ? 'available'
          : 'working';

  return {
    signerDisabled,
    status,
    tone,
    label,
    target,
    tee,
  };
}
