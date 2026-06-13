export type TeeAttestationCheckView = {
  id: string;
  passed: boolean;
  detail?: string;
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
