export type UpstreamTeeVendor =
  | 'venice'
  | 'redpill'
  | 'near'
  | 'chutes'
  | 'phala'
  | 'xai'
  | 'zai'
  | 'anthropic'
  | 'darkbloom';

export type UpstreamTeeCheck = {
  id: string;
  passed: boolean;
  detail?: string;
};

export type UpstreamAttestationVerifyInput = {
  vendor: UpstreamTeeVendor;
  modelId: string;
  nonce: string;
  report: Record<string, unknown>;
  mockMode?: boolean;
};

export type UpstreamAttestationVerifyResult = {
  valid: boolean;
  vendor: UpstreamTeeVendor;
  modelId: string;
  nonce: string;
  verifiedAt: string;
  signingAddress?: string;
  signingAlgo?: 'ecdsa' | 'ed25519';
  serverVerified?: boolean;
  e2eeReady?: boolean;
  checks: UpstreamTeeCheck[];
  explorerUrl?: string;
};
