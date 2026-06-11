import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SanitizedTaskSpec } from '@bossraid/shared-types';
import {
  buildContributionRolePlan,
  buildContributionWorkstreamAllocations,
  getContributionFamily,
  getRootContributionFamilyId,
} from './partition.js';

function textTask(description: string): SanitizedTaskSpec {
  return {
    title: 'text task',
    description,
    language: 'text',
    files: [],
    output: { primaryType: 'text', artifactTypes: ['text'] },
    constraints: { allowedOutputTypes: ['text'], requireSpecializations: [] },
    failingSignals: {
      errors: [],
      reproSteps: [],
      expectedBehavior: description,
    },
    sanitizationReport: {
      riskTier: 'safe',
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  } as unknown as SanitizedTaskSpec;
}

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

  it('allocates experts across workstreams', () => {
    const allocations = buildContributionWorkstreamAllocations({
      task: textTask('Summarize the migration risks for the API rollout.'),
      totalExperts: 3,
    });

    assert.ok(allocations.length > 0);
    assert.equal(
      allocations.reduce((sum, item) => sum + item.assignedExperts, 0),
      3
    );
  });

  it('builds role plans from templates', () => {
    const family = getContributionFamily('text_root');
    const plan = buildContributionRolePlan({
      task: textTask('Draft a concise status update.'),
      providerIndex: 1,
      totalExperts: 2,
    });

    assert.ok(family.workstreams.some((workstream) => workstream.id === plan.workstreamId));
    assert.match(plan.prompt, /./);
  });
});
