import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHarnessProfile,
  computeCompositionHash,
  normalizeHarnessKind,
  parseHarnessSkills,
  resolveInstallation,
} from './profile.js';

test('normalizeHarnessKind maps aliases', () => {
  assert.equal(normalizeHarnessKind(undefined), 'off');
  assert.equal(normalizeHarnessKind('codex'), 'codex');
  assert.equal(normalizeHarnessKind('grok'), 'grok');
  assert.equal(normalizeHarnessKind('true'), 'codex');
  assert.throws(() => normalizeHarnessKind('claude'), /BOSSRAID_HARNESS_MODE/);
});

test('parseHarnessSkills and installation', () => {
  const skills = parseHarnessSkills('unity-debug@1.0,patch-hygiene');
  assert.equal(skills.length, 2);
  assert.equal(skills[0]?.id, 'unity-debug');
  assert.equal(skills[0]?.version, '1.0');
  assert.equal(resolveInstallation(skills), 'skill_augmented');
  assert.equal(resolveInstallation([]), 'fresh');
});

test('composition hash is stable for same profile', () => {
  const skills = parseHarnessSkills('a,b');
  const left = computeCompositionHash({
    kind: 'codex',
    installation: 'skill_augmented',
    skills,
    imageDigest: 'sha256:abc',
    modelId: 'gpt-5.5',
    modelApiBase: 'https://api.openai.com/v1',
  });
  const right = computeCompositionHash({
    kind: 'codex',
    installation: 'skill_augmented',
    skills: parseHarnessSkills('b,a'),
    imageDigest: 'sha256:abc',
    modelId: 'gpt-5.5',
    modelApiBase: 'https://api.openai.com/v1',
  });
  assert.equal(left, right);

  const profile = buildHarnessProfile({
    kind: 'grok',
    installation: 'fresh',
    skills: [],
    modelId: 'grok-4.5',
    modelApiBase: 'https://api.x.ai/v1',
    maxSteps: 8,
    allowShell: false,
  });
  assert.equal(profile?.lane, 'agent_harness');
  assert.equal(profile?.installation, 'fresh');
  assert.equal(profile?.framework, 'grok');
  assert.equal(profile?.planProvider, 'xai');
  assert.ok(profile?.compositionHash);
});
