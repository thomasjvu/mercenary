import { verifyUpstreamTeeAttestation } from '@bossraid/privacy-engine';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { TeeAttestationResult } from '@bossraid/shared-types';
import { fetchUpstreamAttestationReport, generateAttestationNonce } from './upstream/index.js';
import { isUpstreamTeeMock } from './upstream-mock.js';

export async function verifySellerUpstreamTeeAttestation(input: {
  provider: UpstreamProviderId;
  modelId: string;
  providerId: string;
  apiKey: string;
  instanceId?: string;
  signingAddress?: string;
  nonce?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<TeeAttestationResult> {
  const nonce = input.nonce ?? generateAttestationNonce();
  const env = input.env ?? process.env;
  const mockMode = isUpstreamTeeMock(env);

  return verifyUpstreamTeeAttestation({
    vendor: input.provider,
    modelId: input.modelId,
    providerId: input.providerId,
    apiKey: input.apiKey,
    nonce,
    instanceId: input.instanceId,
    signingAddress: input.signingAddress,
    mockMode,
    fetchReport: mockMode
      ? undefined
      : async (fetchInput) =>
          fetchUpstreamAttestationReport({
            provider: fetchInput.vendor,
            apiKey: fetchInput.apiKey,
            modelId: fetchInput.modelId,
            nonce: fetchInput.nonce,
            instanceId: fetchInput.instanceId,
            signingAddress: fetchInput.signingAddress,
          }),
  });
}
