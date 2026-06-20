import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeTask } from '@bossraid/raid-core';
import { createSpawnInput } from '@bossraid/test-fixtures';
import type { ProviderSubmission } from '@bossraid/shared-types';
import {
  computeFinalScore,
  invalid,
  parseTouchedFilesFromDiff,
  validateSubmissionSchema,
} from './index.js';

function buildSubmission(overrides: Partial<ProviderSubmission> = {}): ProviderSubmission {
  return {
    raidId: 'raid-scoring-1',
    providerId: 'provider-1',
    providerRunId: 'run-1',
    patchUnifiedDiff: [
      '--- a/src/components/Form.tsx',
      '+++ b/src/components/Form.tsx',
      '@@ -1,3 +1,3 @@',
      '-  const disabled = true;',
      '+  const disabled = false;',
    ].join('\n'),
    explanation: 'The save button stayed disabled because the flag never cleared.',
    claimedRootCause: 'disabled flag never cleared',
    confidence: 0.8,
    filesTouched: ['src/components/Form.tsx'],
    submittedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('invalid returns a zeroed evaluation breakdown with reason', () => {
  const breakdown = invalid('missing_hunks', 'Submission schema validation failed.');
  assert.equal(breakdown.valid, false);
  assert.equal(breakdown.finalScore, 0);
  assert.deepEqual(breakdown.invalidReasons, ['missing_hunks']);
});

test('validateSubmissionSchema rejects patch tasks without hunks', () => {
  const task = sanitizeTask(createSpawnInput());
  const issues = validateSubmissionSchema(task, buildSubmission({ patchUnifiedDiff: 'no hunks' }));
  assert.ok(issues.includes('missing_hunks'));
});

test('parseTouchedFilesFromDiff extracts unique file paths', () => {
  const files = parseTouchedFilesFromDiff(buildSubmission().patchUnifiedDiff ?? '');
  assert.deepEqual(files, ['src/components/Form.tsx']);
});

test('computeFinalScore weights test results when regression hints exist', () => {
  const withTests = computeFinalScore({
    buildScore: 0.8,
    testScore: 1,
    heuristicScore: 0.5,
    correctnessRubric: 0.7,
    sideEffectSafety: 0.9,
    explanationScore: 0.6,
    latencyScore: 0.5,
    uniquenessScore: 0.4,
    hasTests: true,
  });
  const withoutTests = computeFinalScore({
    buildScore: 0.8,
    testScore: 1,
    heuristicScore: 0.5,
    correctnessRubric: 0.7,
    sideEffectSafety: 0.9,
    explanationScore: 0.6,
    latencyScore: 0.5,
    uniquenessScore: 0.4,
    hasTests: false,
  });
  assert.ok(withTests > withoutTests);
});
