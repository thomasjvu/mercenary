import assert from "node:assert/strict";
import test from "node:test";
import { scanForReexposedContent, checkForExternalTransmission } from "./scanner.js";

test("scanForReexposedContent returns no issues when no redacted content", () => {
  const result = scanForReexposedContent({
    sanitizationReport: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: "safe",
      issues: [],
    },
    answerText: "This is a clean answer",
  });

  assert.equal(result.reexposed, false);
  assert.equal(result.issues.length, 0);
});

test("scanForReexposedContent detects reexposed placeholders", () => {
  const result = scanForReexposedContent({
    sanitizationReport: {
      redactedSecrets: 2,
      redactedIdentifiers: 1,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: "safe",
      issues: [],
    },
    answerText: "Here is the API key: [REDACTED_SECRET]",
    explanation: "Used placeholder *** for the token",
  });

  // Detect placeholders means content was flagged as potential reexposure
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.some((i) => i.code === "REDACTED_PLACEHOLDER_EXPOSED"));
});

test("checkForExternalTransmission detects external API references", () => {
  const result = checkForExternalTransmission(
    "Called openai.com for completion",
    [{ label: "result", description: "Got response from api.openai.com" }],
  );

  assert.equal(result.detected, false);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.some((i) => i.code === "EXTERNAL_API_REFERENCE"));
  assert.ok(result.issues.some((i) => i.message.includes("openai.com")));
});

test("checkForExternalTransmission returns empty when no external references", () => {
  const result = checkForExternalTransmission(
    "Processed the data internally without external calls",
    undefined,
  );

  assert.equal(result.detected, false);
  assert.equal(result.issues.length, 0);
});

test("scanForReexposedContent handles missing optional fields", () => {
  const result = scanForReexposedContent({
    sanitizationReport: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: "safe",
      issues: [],
    },
  });

  assert.equal(result.reexposed, false);
  assert.equal(result.issues.length, 0);
});

test("checkForExternalTransmission handles empty explanation", () => {
  const result = checkForExternalTransmission(undefined, []);

  assert.equal(result.detected, false);
  assert.equal(result.issues.length, 0);
});