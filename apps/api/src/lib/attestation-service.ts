import { verifyUpstreamTeeAttestation } from '@bossraid/privacy-engine';
import type { UpstreamProviderId } from '@bossraid/constants';
import { fetchUpstreamAttestationReport, generateAttestationNonce } from './upstream/index.js';
import { isProviderTeeMock } from './upstream-mock.js';

export async function verifyUpstreamTee(input: {
  provider: UpstreamProviderId;
  modelId: string;
  providerId: string;
  apiKey: string;
  instanceId?: string;
  signingAddress?: string;
  nonce?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const nonce = input.nonce ?? generateAttestationNonce();
  const env = input.env ?? process.env;
  const mockMode = isProviderTeeMock(input.provider, env);

  const attestation = await verifyUpstreamTeeAttestation({
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
            modelId: fetchInput.modelId,
            apiKey: fetchInput.apiKey,
            nonce: fetchInput.nonce,
            instanceId: fetchInput.instanceId,
            signingAddress: fetchInput.signingAddress,
          }),
  });

  return { attestation, nonce };
}
