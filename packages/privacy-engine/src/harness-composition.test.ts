import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHarnessCompositionHash,
  harnessFreshClaimIsConsistent,
  parseHarnessSkills,
  recomputeHarnessCompositionHash,
  resolveHarnessInstallation,
} from './harness-composition.js';

test('parseHarnessSkills and installation', () => {
  const skills = parseHarnessSkills('unity-debug@1.0,patch-hygiene');
  assert.equal(skills.length, 2);
  assert.equal(resolveHarnessInstallation(skills), 'skill_augmented');
  assert.equal(resolveHarnessInstallation([]), 'fresh');
});

test('composition hash is order-stable for skills', () => {
  const a = parseHarnessSkills('a,b');
  const b = parseHarnessSkills('b,a');
  const left = computeHarnessCompositionHash({
    kind: 'codex',
    installation: 'skill_augmented',
    skills: a,
    imageDigest: 'sha256:abc',
    modelId: 'gpt-5.5',
    modelApiBase: 'https://api.openai.com/v1',
  });
  const right = computeHarnessCompositionHash({
    kind: 'codex',
    installation: 'skill_augmented',
    skills: b,
    imageDigest: 'sha256:abc',
    modelId: 'gpt-5.5',
    modelApiBase: 'https://api.openai.com/v1',
  });
  assert.equal(left, right);
});

test('recomputeHarnessCompositionHash matches compute for profile-shaped input', () => {
  const skills = parseHarnessSkills('glm-skill');
  const hash = computeHarnessCompositionHash({
    kind: 'glm',
    installation: 'skill_augmented',
    skills,
    modelId: 'glm-4.7',
    modelApiBase: 'https://api.z.ai/api/coding/paas/v4',
  });
  const recomputed = recomputeHarnessCompositionHash({
    kind: 'glm',
    installation: 'skill_augmented',
    skills,
    framework: 'glm',
    planProvider: 'zai',
    modelId: 'glm-4.7',
    modelApiBase: 'https://api.z.ai/api/coding/paas/v4',
  });
  assert.equal(hash, recomputed);
});

test('fresh claim rejects non-empty skills', () => {
  assert.equal(harnessFreshClaimIsConsistent({ installation: 'fresh', skills: [] }), true);
  assert.equal(
    harnessFreshClaimIsConsistent({
      installation: 'fresh',
      skills: [{ id: 'x' }],
    }),
    false
  );
});
