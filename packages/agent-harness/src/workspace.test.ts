import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import { createHarnessWorkspace } from './workspace.js';

function sampleTask(): ProviderTaskPackage {
  return {
    raidId: 'raid-1',
    submissionFormat: 'unified_diff_plus_explanation',
    desiredOutput: { primaryType: 'patch', artifactTypes: ['patch'] },
    task: {
      title: 'Fix bug',
      description: 'Change return value',
      language: 'typescript',
      framework: 'node',
    },
    artifacts: {
      files: [{ path: 'src/main.ts', content: 'export const n = 1;\n', sha256: 'a' }],
      errors: ['expected 2'],
      reproSteps: [],
      tests: [],
    },
    constraints: {
      maxChangedFiles: 10,
      maxDiffLines: 400,
      forbidPaths: [],
      mustNot: [],
    },
    deadlineUnix: Math.floor(Date.now() / 1000) + 120,
  };
}

test('workspace seeds files, writes, and builds diff', async () => {
  const workspace = await createHarnessWorkspace(sampleTask());
  try {
    const files = await workspace.listFiles();
    assert.deepEqual(files, ['src/main.ts']);
    const text = await workspace.readText('src/main.ts');
    assert.match(text, /export const n = 1/);
    await workspace.writeText('src/main.ts', 'export const n = 2;\n');
    const diff = await workspace.buildUnifiedDiff();
    assert.ok(diff?.includes('export const n = 2'));
    assert.ok(diff?.includes('--- a/src/main.ts'));
  } finally {
    await workspace.dispose();
  }
});

test('workspace blocks path escape', async () => {
  const workspace = await createHarnessWorkspace(sampleTask());
  try {
    await assert.rejects(() => workspace.readText('../etc/passwd'), /escapes workspace/);
  } finally {
    await workspace.dispose();
  }
});
