import { createHash } from 'node:crypto';
import { type SanitizedTaskSpec, type TaskFile } from '@bossraid/shared-types';

export function buildEvaluatorSmokeTask(): {
  task: SanitizedTaskSpec;
  files: TaskFile[];
  touchedFiles: string[];
} {
  const files = [
    createSmokeFile(
      'package.json',
      JSON.stringify(
        {
          name: 'bossraid-evaluator-smoke',
          private: true,
          type: 'module',
          scripts: {
            test: 'node --test',
          },
        },
        null,
        2
      )
    ),
    createSmokeFile('sum.js', ['export function sum(a, b) {', '  return a + b;', '}'].join('\n')),
    createSmokeFile(
      'sum.test.js',
      [
        'import assert from "node:assert/strict";',
        'import test from "node:test";',
        'import { sum } from "./sum.js";',
        '',
        'test("sum adds positive integers", () => {',
        '  assert.equal(sum(2, 3), 5);',
        '});',
      ].join('\n')
    ),
  ];

  return {
    task: {
      taskTitle: 'Evaluator smoke test',
      taskDescription:
        'Confirm the configured evaluator can execute an isolated Node built-in test suite.',
      language: 'text',
      framework: 'node',
      files,
      failingSignals: {
        errors: ['sum must return the correct arithmetic result.'],
        tests: ['node --test'],
        reproSteps: ['Run node --test in the workspace.'],
      },
      output: {
        primaryType: 'patch',
        artifactTypes: ['patch', 'text'],
      },
      constraints: {
        numExperts: 1,
        maxBudgetUsd: 1,
        maxLatencySec: 30,
        allowExternalSearch: false,
        requireSpecializations: ['node'],
        minReputation: 0,
        allowedOutputTypes: ['patch', 'text'],
        privacyMode: 'off',
      },
      rewardPolicy: {
        splitStrategy: 'equal_success_only',
      },
      privacyMode: {
        redactSecrets: false,
        redactIdentifiers: false,
        allowFullRepo: false,
      },
      hostContext: {
        host: 'codex',
      },
      originalFileCount: files.length,
      originalBytes: files.reduce(
        (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
        0
      ),
      sanitizationReport: {
        redactedSecrets: 0,
        redactedIdentifiers: 0,
        removedUrls: 0,
        trimmedFiles: 0,
        unsafeContentDetected: false,
        riskTier: 'safe',
        issues: [],
      },
    },
    files,
    touchedFiles: ['sum.js'],
  };
}

export function createSmokeFile(path: string, content: string): TaskFile {
  return {
    path,
    content,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}
