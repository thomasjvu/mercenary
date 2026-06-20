import assert from 'node:assert/strict';
import test from 'node:test';
import { createRaidRecord, sanitizeTask } from '@bossraid/raid-core';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import type { ProviderSubmission } from '@bossraid/shared-types';
import { evaluateSubmission } from './index.js';

function buildSubmission(overrides: Partial<ProviderSubmission> = {}): ProviderSubmission {
  return {
    raidId: 'raid-eval-1',
    providerId: 'provider-1',
    providerRunId: 'run-1',
    patchUnifiedDiff: 'broken diff',
    explanation: 'too short',
    confidence: 2,
    filesTouched: [],
    submittedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('evaluateSubmission returns invalid breakdown for schema failures', async () => {
  const provider = createProviderProfile('provider-eval');
  const raid = createRaidRecord(sanitizeTask(createSpawnInput()), {
    primaries: [provider],
    reserves: [],
  });
  const breakdown = await evaluateSubmission(raid, buildSubmission({ raidId: raid.id }));
  assert.equal(breakdown.valid, false);
  assert.ok((breakdown.invalidReasons ?? []).length > 0);
  assert.match(breakdown.summary ?? '', /schema validation failed/i);
});
