import type { TeeAttestationResult } from './provider.js';

export type InferenceTransport = 'venice-e2ee' | 'plaintext';

export type InferenceVerificationStatus = 'verified' | 'failed' | 'mock';

export interface InferenceAttestationReceipt {
  receiptId: string;
  modelId: string;
  providerId: string;
  route: 'inference' | 'gateway' | 'marketplace';
  nonce: string;
  tee: TeeAttestationResult;
  transport: InferenceTransport;
  inputHash: string;
  outputHash: string;
  completedAt: string;
  explorerUrl?: string;
  verificationStatus: InferenceVerificationStatus;
}
