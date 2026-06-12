import type { UpstreamProviderId } from '@bossraid/constants';
import { fetchJson } from './client.js';

export type TeeAttestationCheck = {
  id: string;
  passed: boolean;
  detail?: string;
};

export type TeeAttestationResponse = {
  object: string;
  provider: UpstreamProviderId;
  modelId: string;
  valid: boolean;
  verifiedAt: string;
  signingAddress?: string;
  e2eeReady?: boolean;
  checks?: TeeAttestationCheck[];
  explorerUrl?: string;
  teeAttested: boolean;
  e2ee: boolean;
};

export async function verifyMarketplaceTeeAttestation(payload: {
  provider: UpstreamProviderId;
  modelId: string;
  sellerId?: string;
  instanceId?: string;
}) {
  return fetchJson<TeeAttestationResponse>('/v1/marketplace/tee/attestation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchModelTeeSummary(modelId: string) {
  return fetchJson<{
    object: string;
    modelId: string;
    provider: UpstreamProviderId;
    teeAttested: boolean;
    e2ee: boolean;
    lastAttestation: {
      valid: boolean;
      verifiedAt: string;
      signingAddress?: string;
      checks?: TeeAttestationCheck[];
      explorerUrl?: string;
    } | null;
  }>(`/v1/marketplace/models/${encodeURIComponent(modelId)}/tee`);
}
