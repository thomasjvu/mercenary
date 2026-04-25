import type {
  PrivacyAttestation,
  PrivacyComplianceIssue,
  PrivacyComplianceRecord,
  PrivacyComplianceResult,
  PrivacyFeatureKey,
  PrivacyRoutingMode,
  ProviderSubmission,
  RankedSubmission,
  SanitizationReport,
} from "@bossraid/shared-types";
import { scanForReexposedContent, checkForExternalTransmission } from "./scanner.js";

export interface PrivacyEngineConfig {
  enabled?: boolean;
  teeSocketPath?: string;
  cacheTtlMs?: number;
}

export function buildPrivacyComplianceResult(
  requiredFeatures: PrivacyFeatureKey[],
  attestation: PrivacyAttestation | undefined,
  scanIssues: PrivacyComplianceIssue[],
): PrivacyComplianceResult {
  const issues: PrivacyComplianceIssue[] = [...scanIssues];

  let dataLineageLeak = false;
  let redactedContentReexposed = false;
  let externalTransmissionDetected = false;

  for (const issue of scanIssues) {
    if (issue.code === "DATA_LINEAGE_LEAK") dataLineageLeak = true;
    if (issue.code === "REDACTED_PLACEHOLDER_EXPOSED") redactedContentReexposed = true;
    if (issue.code === "EXTERNAL_API_REFERENCE") externalTransmissionDetected = true;
  }

  if (attestation?.dataRetained) {
    issues.push({
      severity: "warn",
      code: "DATA_RETAINED",
      message: `Provider ${attestation.providerId} retained data from this raid.`,
    });
  }

  if (attestation) {
    const claimed = new Set(attestation.featuresClaimed);
    const verified = new Set(attestation.featuresVerified);
    for (const feature of requiredFeatures) {
      if (claimed.has(feature) && !verified.has(feature)) {
        issues.push({
          severity: "error",
          code: "FEATURE_NOT_VERIFIED",
          message: `Required privacy feature '${feature}' was claimed but not verified for provider ${attestation.providerId}.`,
        });
      }
    }
    const unclaimed = requiredFeatures.filter((f) => !claimed.has(f));
    if (unclaimed.length > 0) {
      issues.push({
        severity: "error",
        code: "REQUIRED_FEATURE_MISSING",
        message: `Provider ${attestation.providerId} did not claim required features: ${unclaimed.join(", ")}.`,
      });
    }
  } else {
    if (requiredFeatures.length > 0) {
      issues.push({
        severity: "error",
        code: "NO_ATTESTATION",
        message: "No privacy attestation provided for this submission. Privacy mode required.",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warn");
  const score = Math.max(0, 100 - errors.length * 30 - warnings.length * 10);
  const passed = errors.length === 0 && requiredFeatures.every(
    (f) => attestation && attestation.featuresVerified.includes(f),
  );

  return {
    passed,
    score,
    dataLineageLeak,
    redactedContentReexposed,
    externalTransmissionDetected,
    issues,
  };
}

export function validateSubmissionPrivacy(
  submission: ProviderSubmission,
  requiredFeatures: PrivacyFeatureKey[],
  sanitizationReport?: SanitizationReport,
): PrivacyComplianceResult {
  const report: SanitizationReport = sanitizationReport ?? {
    redactedSecrets: 0,
    redactedIdentifiers: 0,
    removedUrls: 0,
    trimmedFiles: 0,
    unsafeContentDetected: false,
    riskTier: "safe",
    issues: [],
  };
  const scanCtx = {
    sanitizationReport: report,
    answerText: submission.answerText,
    explanation: submission.explanation,
    artifacts: submission.artifacts?.map((a) => ({ label: a.label, description: a.description })),
  };

  const reexposedResult = scanForReexposedContent(scanCtx);
  const transmissionResult = checkForExternalTransmission(
    submission.explanation,
    submission.artifacts?.map((a) => ({ label: a.label, description: a.description })),
  );

  const allIssues = [
    ...reexposedResult.issues,
    ...transmissionResult.issues,
  ];

  return buildPrivacyComplianceResult(
    requiredFeatures,
    submission.privacyAttestation,
    allIssues,
  );
}

export function computePrivacyCompliance(
  rankedSubmissions: RankedSubmission[],
  privacyMode: PrivacyRoutingMode,
  requiredFeatures: PrivacyFeatureKey[],
  sanitizationReport?: SanitizationReport,
): PrivacyComplianceResult {
  if (privacyMode === "off" || requiredFeatures.length === 0) {
    return {
      passed: true,
      score: 100,
      dataLineageLeak: false,
      redactedContentReexposed: false,
      externalTransmissionDetected: false,
      issues: [],
    };
  }

  for (const { submission } of rankedSubmissions) {
    const result = validateSubmissionPrivacy(submission, requiredFeatures, sanitizationReport);
    if (!result.passed) {
      return result;
    }
  }

  return {
    passed: true,
    score: 100,
    dataLineageLeak: false,
    redactedContentReexposed: false,
    externalTransmissionDetected: false,
    issues: [],
  };
}

export function buildPrivacyComplianceRecord(
  raidId: string,
  privacyMode: PrivacyRoutingMode,
  requiredFeatures: PrivacyFeatureKey[],
  rankedSubmissions: RankedSubmission[],
  sanitizationReport?: SanitizationReport,
): PrivacyComplianceRecord {
  const perProviderCompliance: Record<string, PrivacyComplianceResult> = {};

  for (const { submission } of rankedSubmissions) {
    perProviderCompliance[submission.providerId] = validateSubmissionPrivacy(
      submission,
      requiredFeatures,
      sanitizationReport,
    );
  }

  const overall = computePrivacyCompliance(
    rankedSubmissions,
    privacyMode,
    requiredFeatures,
    sanitizationReport,
  );

  const providerAttestations = rankedSubmissions
    .map((r) => r.submission.privacyAttestation)
    .filter(Boolean) as PrivacyAttestation[];

  return {
    raidId,
    privacyMode,
    requiredFeatures,
    providerAttestations,
    perProviderCompliance,
    overallPassed: overall.passed,
    overallScore: overall.score,
    evaluatedAt: new Date().toISOString(),
  };
}