import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SanitizedTaskSpec } from '@bossraid/shared-types';
import { getRootContributionFamilyId } from './partition/index.js';

function patchTask(description: string): SanitizedTaskSpec {
  return {
    title: 'patch task',
    description,
    language: 'typescript',
    files: [{ path: 'src/index.ts', content: 'export {}', sha256: 'demo-patch-file' }],
    output: { primaryType: 'patch', artifactTypes: ['patch'] },
    constraints: { allowedOutputTypes: ['patch'], requireSpecializations: [] },
    failingSignals: {
      errors: ['null pointer'],
      reproSteps: ['open file'],
      expectedBehavior: 'fix the null pointer',
    },
    sanitizationReport: {
      riskTier: 'safe',
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  } as unknown as SanitizedTaskSpec;
}

describe('partition', () => {
  it('selects patch family for patch tasks', () => {
    const familyId = getRootContributionFamilyId(patchTask('Fix the null pointer in index.ts'));

    assert.equal(familyId, 'patch_root');
  });
});
