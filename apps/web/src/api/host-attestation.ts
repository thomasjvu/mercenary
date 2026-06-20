import type { TeeAttestationView } from '@bossraid/shared-types';
import type { AttestedRuntimePayload } from './raid.js';
import { fetchJson } from './client.js';

export type HostAttestationSignedRuntime = {
  signer: string;
  message: string;
  messageHash: `0x${string}`;
  signature: `0x${string}`;
  payload: AttestedRuntimePayload;
};

export type HostAttestationResponse = {
  object: 'host_attestation';
  deploymentTarget: string | null;
  teePlatform: string | null;
  verified: boolean;
  verifiedAt: string;
  teeAttestation?: TeeAttestationView;
  signedRuntime?: HostAttestationSignedRuntime;
};

export async function fetchHostAttestation(): Promise<HostAttestationResponse> {
  return fetchJson<HostAttestationResponse>('/v1/host/attestation');
}

export async function fetchHostAttestationOptional(): Promise<HostAttestationResponse | undefined> {
  try {
    return await fetchHostAttestation();
  } catch (error) {
    if (error instanceof Error && /503|tee_unavailable|tee unavailable/i.test(error.message)) {
      return undefined;
    }
    throw error;
  }
}
