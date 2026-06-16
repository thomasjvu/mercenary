import type { AttestedEnvelope, AttestedRuntimePayload } from '../api';
import {
  buildRuntimeAttestationLabel,
  isAttestationSignerUnavailable,
} from '../mercenary-result.js';
import type { SpecialistTone } from '../components/mercenary/mercenary-ui';

export function deriveRuntimeAttestationStatus(input: {
  data: AttestedEnvelope<AttestedRuntimePayload> | null | undefined;
  error: string | null | undefined;
}): {
  signerDisabled: boolean;
  status: string;
  tone: SpecialistTone;
  label: string;
  target: string;
  tee: string;
} {
  const signerDisabled = isAttestationSignerUnavailable(input.error);
  const status = input.data
    ? 'live'
    : signerDisabled
      ? 'proof unpublished'
      : input.error
        ? 'unavailable'
        : 'loading';
  const target =
    input.data?.payload.deploymentTarget ?? (signerDisabled ? 'not published' : 'pending');
  const tee = input.data?.payload.teePlatform ?? (signerDisabled ? 'provider TEE live' : 'pending');
  const label = input.data
    ? buildRuntimeAttestationLabel(target, tee)
    : signerDisabled
      ? 'Provider TEE live'
      : buildRuntimeAttestationLabel(target, tee);
  const tone: SpecialistTone = input.data
    ? 'ready'
    : signerDisabled
      ? 'available'
      : input.error
        ? 'offline'
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
