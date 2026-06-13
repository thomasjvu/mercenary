import { randomBytes } from 'node:crypto';
import type { TeeAttestationResult } from '@bossraid/shared-types';
import { toTeeAttestationResult, verifyUpstreamAttestationReport } from './verify.js';
import type { UpstreamAttestationVerifyResult, UpstreamTeeVendor } from './types.js';

export type {
  UpstreamAttestationVerifyResult,
  UpstreamTeeCheck,
  UpstreamTeeVendor,
} from './types.js';

export { verifyUpstreamAttestationReport, toTeeAttestationResult } from './verify.js';

export type VerifyUpstreamTeeAttestationInput = {
  vendor: UpstreamTeeVendor;
  modelId: string;
  providerId: string;
  apiKey?: string;
  nonce?: string;
  instanceId?: string;
  signingAddress?: string;
  mockMode?: boolean;
  fetchReport?: (input: {
    vendor: UpstreamTeeVendor;
    modelId: string;
    apiKey: string;
    nonce: string;
    instanceId?: string;
    signingAddress?: string;
  }) => Promise<Record<string, unknown>>;
};

export async function verifyUpstreamTeeAttestation(
  input: VerifyUpstreamTeeAttestationInput
): Promise<
  TeeAttestationResult & { e2eeReady?: boolean; checks?: unknown[]; explorerUrl?: string }
> {
  const nonce = input.nonce ?? randomBytes(32).toString('hex');
  const mockMode = input.mockMode === true || process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1';

  if (mockMode || !input.fetchReport || !input.apiKey) {
    const mockReport =
      input.vendor === 'near'
        ? {
            model_attestations: [
              {
                signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
                request_nonce: nonce,
                intel_quote: 'mock-intel-quote',
                nvidia_payload: JSON.stringify({ nonce }),
              },
            ],
          }
        : input.vendor === 'chutes'
          ? {
              quote: 'mock-tdx-quote',
              gpu_evidence: [{ nonce }],
              certificate: 'mock-cert',
            }
          : input.vendor === 'venice'
            ? {
                verified: true,
                nonce,
                model: input.modelId,
                signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
                signing_key: '04' + 'a'.repeat(128),
                intel_quote: 'mock-intel-quote',
              }
            : {
                signing_address: '0x3573d4c8b9c3ce0360594095af0c0629de45c02a',
                request_nonce: nonce,
                intel_quote: 'mock-intel-quote',
                nvidia_payload: JSON.stringify({ nonce }),
              };

    const verified = verifyUpstreamAttestationReport({
      vendor: input.vendor,
      modelId: input.modelId,
      nonce,
      report: mockReport,
      mockMode,
    });
    const signingKey =
      typeof mockReport.signing_key === 'string' ? mockReport.signing_key : undefined;
    return toTeeAttestationResult(input.providerId, verified, { signingKey, mockMode });
  }

  const report = await input.fetchReport({
    vendor: input.vendor,
    modelId: input.modelId,
    apiKey: input.apiKey,
    nonce,
    instanceId: input.instanceId,
    signingAddress: input.signingAddress,
  });

  const verified: UpstreamAttestationVerifyResult = verifyUpstreamAttestationReport({
    vendor: input.vendor,
    modelId: input.modelId,
    nonce,
    report,
    mockMode,
  });

  const signingKey =
    typeof report.signing_key === 'string'
      ? report.signing_key
      : typeof report.signing_public_key === 'string'
        ? report.signing_public_key
        : undefined;

  return toTeeAttestationResult(input.providerId, verified, { signingKey, mockMode });
}
