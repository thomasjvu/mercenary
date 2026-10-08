const MOCK_SIGNING_ADDRESS = '0x3573d4c8b9c3ce0360594095af0c0629de45c02a';

export function buildMockVeniceTeeReport(input: {
  modelId: string;
  nonce: string;
}): Record<string, unknown> {
  return {
    verified: true,
    nonce: input.nonce,
    model: input.modelId,
    tee_provider: 'venice',
    signing_address: MOCK_SIGNING_ADDRESS,
    intel_quote: 'mock-intel-quote',
  };
}
