import type { UpstreamProviderId } from '@bossraid/constants';
import type {
  MarketplaceModelTeeSummaryView,
  MarketplaceTeeAttestationView,
} from '@bossraid/shared-types';
import { fetchJson } from './client.js';

export type TeeAttestationResponse = MarketplaceTeeAttestationView;
export type ModelTeeSummary = MarketplaceModelTeeSummaryView;

const MODEL_TEE_CACHE_TTL_MS = 5 * 60 * 1000;
const modelTeeCache = new Map<string, { expiresAt: number; data: ModelTeeSummary }>();

function isFreshAttestation(
  lastAttestation: ModelTeeSummary['lastAttestation']
): ModelTeeSummary['lastAttestation'] {
  if (!lastAttestation?.verifiedAt) {
    return null;
  }

  const verifiedAtMs = Date.parse(lastAttestation.verifiedAt);
  if (!Number.isFinite(verifiedAtMs) || Date.now() - verifiedAtMs > MODEL_TEE_CACHE_TTL_MS) {
    return null;
  }

  return lastAttestation;
}

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
  const cached = modelTeeCache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await fetchJson<ModelTeeSummary>(
    `/v1/marketplace/models/${encodeURIComponent(modelId)}/tee`
  );
  const data: ModelTeeSummary = {
    ...response,
    lastAttestation: isFreshAttestation(response.lastAttestation),
  };

  modelTeeCache.set(modelId, {
    expiresAt: Date.now() + MODEL_TEE_CACHE_TTL_MS,
    data,
  });

  return data;
}
