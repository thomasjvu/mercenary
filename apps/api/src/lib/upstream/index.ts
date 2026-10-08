import { fetchVeniceAttestationReport } from './venice.js';
export { generateAttestationNonce } from './shared.js';

export async function fetchUpstreamAttestationReport(input: {
  provider: string;
  apiKey: string;
  modelId: string;
  nonce: string;
  instanceId?: string;
  signingAddress?: string;
}): Promise<Record<string, unknown>> {
  if (input.provider !== 'venice') throw new Error('Mercenary supports Venice attestation only.');
  return fetchVeniceAttestationReport(input);
}
