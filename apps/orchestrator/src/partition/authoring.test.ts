import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SanitizedTaskSpec } from '@bossraid/shared-types';
import { getContributionFamily } from './index.js';
import {
  authorContributionFamilyWorkstreams,
  expandRoleTemplates,
  isGameTask,
  selectExpansionTarget,
  taskCanRouteThroughGameWorkstreams,
} from './authoring.js';

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

function gameTask(): SanitizedTaskSpec {
  return {
    title: 'GB Studio boss intro',
    description: 'Build a playable GB Studio boss intro and pixel-art pack.',
    language: 'typescript',
    framework: 'gb-studio',
    files: [{ path: 'game/project.gbsproj', content: '{}', sha256: 'demo-game-file' }],
    output: { primaryType: 'patch', artifactTypes: ['patch', 'text'] },
    constraints: { allowedOutputTypes: ['patch', 'text'], requireSpecializations: [] },
    failingSignals: {
      errors: [],
      reproSteps: ['open project'],
      expectedBehavior: 'Return a playable GB Studio patch plus pixel-art support.',
    },
    sanitizationReport: {
      riskTier: 'safe',
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  } as unknown as SanitizedTaskSpec;
}

describe('partition authoring', () => {
  it('expandRoleTemplates cycles roles when expert count exceeds templates', () => {
    const family = getContributionFamily('text_root');
    const template = family.workstreams[0]!;
    const roles = expandRoleTemplates(template, 4);

    assert.equal(roles.length, 4);
    assert.equal(roles[0]?.id, template.roles[0]?.id);
    assert.equal(roles[3]?.id, template.roles[3 % template.roles.length]?.id);
  });

  it('selectExpansionTarget prefers higher expansion bias with fewer assigned experts', () => {
    const family = getContributionFamily('text_root');
    const target = selectExpansionTarget(family.workstreams, new Map());
    const highestBias = Math.max(
      ...family.workstreams.map((workstream) => workstream.expansionBias)
    );

    assert.equal(target.expansionBias, highestBias);
  });

  it('detects game tasks and patch-capable routing', () => {
    const task = gameTask();
    assert.equal(isGameTask(task), true);
    assert.equal(taskCanRouteThroughGameWorkstreams(task), true);
    assert.equal(taskCanRouteThroughGameWorkstreams(patchTask('Fix bug')), true);
  });

  it('authorContributionFamilyWorkstreams injects task context into prompts', () => {
    const family = getContributionFamily('patch_root');
    const task = patchTask('Fix the null pointer in index.ts');
    const authored = authorContributionFamilyWorkstreams(task, family.workstreams);
    const firstRole = authored[0]?.roles[0];

    assert.ok(firstRole);
    assert.match(firstRole.prompt, /null pointer|index\.ts/i);
    assert.match(firstRole.objective, /./);
  });

  it('authorContributionFamilyWorkstreams adds game route specializations', () => {
    const family = getContributionFamily('text_root');
    const textGameTask = {
      ...gameTask(),
      output: { primaryType: 'text', artifactTypes: ['text'] },
      constraints: {
        ...gameTask().constraints,
        allowedOutputTypes: ['text'],
        requireSpecializations: [],
      },
    } as unknown as SanitizedTaskSpec;
    const authored = authorContributionFamilyWorkstreams(textGameTask, family.workstreams);
    const answer = authored.find((workstream) => workstream.id === 'answer');
    const constraints = authored.find((workstream) => workstream.id === 'constraints');

    assert.ok(answer?.routeSpecializations?.includes('gb-studio'));
    assert.ok(constraints?.routeSpecializations?.includes('pixel-art'));
  });
});
