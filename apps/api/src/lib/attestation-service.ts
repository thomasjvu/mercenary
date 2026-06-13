import { createHash } from 'node:crypto';
import { verifyUpstreamTeeAttestation } from '@bossraid/privacy-engine';
import type { InferenceAttestationReceipt, InferenceTransport } from '@bossraid/shared-types';
import type { UpstreamProviderId } from '@bossraid/constants';
import { fetchUpstreamAttestationReport, generateAttestationNonce } from './upstream/index.js';
import type { InferenceReceiptStore } from './inference-receipt-store.js';
import { isProviderTeeMock } from './upstream-mock.js';

export function hashInferenceText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

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

export function buildInferenceReceipt(input: {
  store: InferenceReceiptStore;
  modelId: string;
  providerId: string;
  route: InferenceAttestationReceipt['route'];
  tee: InferenceAttestationReceipt['tee'];
  transport: InferenceTransport;
  inputText: string;
  outputText: string;
  nonce: string;
}): InferenceAttestationReceipt {
  const receipt: InferenceAttestationReceipt = {
    receiptId: input.store.createId(),
    modelId: input.modelId,
    providerId: input.providerId,
    route: input.route,
    nonce: input.nonce,
    tee: input.tee,
    transport: input.transport,
    inputHash: hashInferenceText(input.inputText),
    outputHash: hashInferenceText(input.outputText),
    completedAt: new Date().toISOString(),
    explorerUrl: input.tee.explorerUrl,
    verificationStatus: input.tee.valid
      ? input.tee.runtimeMode === 'mock'
        ? 'mock'
        : 'verified'
      : 'failed',
  };

  return input.store.save(receipt);
}
