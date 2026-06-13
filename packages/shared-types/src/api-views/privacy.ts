export type TeeAttestationCheckView = {
  id: string;
  passed: boolean;
  detail?: string;
};

import type { UpstreamProviderId } from '@bossraid/constants';

export type MarketplaceTeeAttestationView = {
  object: string;
  provider: UpstreamProviderId;
  modelId: string;
  valid: boolean;
  verifiedAt: string;
  signingAddress?: string;
  e2eeReady?: boolean;
  checks?: TeeAttestationCheckView[];
  explorerUrl?: string;
  teeAttested: boolean;
  e2ee: boolean;
};

export type MarketplaceModelTeeSummaryView = {
  object: string;
  modelId: string;
  provider: UpstreamProviderId;
  teeAttested: boolean;
  e2ee: boolean;
  lastAttestation: {
    valid: boolean;
    verifiedAt: string;
    signingAddress?: string;
    checks?: TeeAttestationCheckView[];
    explorerUrl?: string;
  } | null;
};

export type TeeAttestationView = {
  valid: boolean;
  providerId: string;
  verifiedAt: string;
  expiresAt?: string;
  vendor: string;
  enclaveHash?: string;
  signature?: string;
  runtimeMode?: string;
  notes?: string[];
  upstreamVendor?: string;
  signingAddress?: string;
  e2eeReady?: boolean;
  explorerUrl?: string;
  checks?: TeeAttestationCheckView[];
};

export type PrivacyAttestationView = {
  providerId: string;
  raidId: string;
  submittedAt: string;
  featuresClaimed: string[];
  featuresVerified: string[];
  teeAttestation?: TeeAttestationView;
  inferenceReceiptId?: string;
  externalApiCalls: string[];
  dataRetained: boolean;
  signedDeclaration: string;
};

export type PrivacyComplianceIssueView = {
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  field?: string;
};

export type PrivacyComplianceResultView = {
  passed: boolean;
  score: number;
  dataLineageLeak: boolean;
  redactedContentReexposed: boolean;
  externalTransmissionDetected: boolean;
  issues: PrivacyComplianceIssueView[];
};

export type PrivacyComplianceRecordView = {
  raidId: string;
  privacyMode: 'off' | 'prefer' | 'strict';
  requiredFeatures: string[];
  providerAttestations: PrivacyAttestationView[];
  perProviderCompliance: Record<string, PrivacyComplianceResultView>;
  overallPassed: boolean;
  overallScore: number;
  evaluatedAt: string;
};
