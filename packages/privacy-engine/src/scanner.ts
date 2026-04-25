import type { PrivacyComplianceIssue, SanitizationReport } from "@bossraid/shared-types";

export interface PrivacyScanContext {
  sanitizationReport: SanitizationReport;
  answerText?: string;
  explanation?: string;
  artifacts?: Array<{ label: string; description?: string }>;
}

const REDACTED_PLACEHOLDER_PATTERNS = [
  "[REDACTED",
  "***",
  "<SECRET>",
  "[API_KEY]",
  "[TOKEN]",
];

const EXTERNAL_API_PATTERNS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.venice.ai",
  "openai.com",
  "anthropic.com",
];

function scanForReexposedContent(ctx: PrivacyScanContext): {
  reexposed: boolean;
  issues: PrivacyComplianceIssue[];
} {
  const issues: PrivacyComplianceIssue[] = [];
  const redacted = ctx.sanitizationReport.redactedSecrets + ctx.sanitizationReport.redactedIdentifiers;

  if (redacted === 0) {
    return { reexposed: false, issues };
  }

  const textToScan = [
    ctx.answerText,
    ctx.explanation,
    ...(ctx.artifacts?.map((a) => a.description) ?? []),
  ].filter(Boolean);

  for (const text of textToScan) {
    if (!text) continue;
    for (const pattern of REDACTED_PLACEHOLDER_PATTERNS) {
      if (text.includes(pattern)) {
        issues.push({
          severity: "warn",
          code: "REDACTED_PLACEHOLDER_EXPOSED",
          message: `Redacted placeholder '${pattern}' found in submission text. Content may not be fully sanitized.`,
        });
      }
    }
  }

  const reexposed = issues.some((i) => i.severity === "error" || i.code === "REDACTED_PLACEHOLDER_EXPOSED");
  return { reexposed, issues };
}

function checkForExternalTransmission(
  explanation: string | undefined,
  artifacts: PrivacyScanContext["artifacts"],
): {
  detected: boolean;
  issues: PrivacyComplianceIssue[];
} {
  const issues: PrivacyComplianceIssue[] = [];
  if (!explanation) {
    return { detected: false, issues };
  }

  const textToCheck = [explanation, ...(artifacts?.map((a) => a.description) ?? [])]
    .filter(Boolean)
    .join(" ");

  for (const pattern of EXTERNAL_API_PATTERNS) {
    const lower = textToCheck.toLowerCase();
    if (lower.includes(pattern)) {
      issues.push({
        severity: "warn",
        code: "EXTERNAL_API_REFERENCE",
        message: `Submission text references external API endpoint: ${pattern}. This may indicate external data transmission.`,
        field: "explanation",
      });
    }
  }

  const detected = issues.some((i) => i.severity === "error");
  return { detected, issues };
}

export { scanForReexposedContent, checkForExternalTransmission };