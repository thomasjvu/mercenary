import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHarnessCompositionHash,
  evaluateHarnessProfileIntegrity,
  harnessFreshClaimIsConsistent,
  harnessProfileQualifiesAsVerifiedAgent,
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

test('evaluateHarnessProfileIntegrity requires digest for specialized agents', () => {
  const specialized = evaluateHarnessProfileIntegrity({
    lane: 'agent_harness',
    installation: 'skill_augmented',
    skills: [{ id: 'raid-pixel' }],
    framework: 'claude_code',
  });
  assert.equal(specialized.ok, false);
  assert.ok(specialized.issues.some((issue) => issue.code === 'image_digest_required'));

  const prevAllowlist = process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
  const prevRequire = process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
  delete process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
  process.env.NODE_ENV = 'test';
  try {
    const withDigest = evaluateHarnessProfileIntegrity({
      lane: 'agent_harness',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:abc',
      framework: 'claude_code',
    });
    assert.equal(withDigest.ok, true);
    assert.equal(
      harnessProfileQualifiesAsVerifiedAgent({
        lane: 'agent_harness',
        installation: 'skill_augmented',
        skills: [{ id: 'raid-pixel' }],
        imageDigest: 'sha256:abc',
        framework: 'claude_code',
      }),
      true
    );
  } finally {
    if (prevAllowlist === undefined) delete process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
    else process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST = prevAllowlist;
    if (prevRequire === undefined) delete process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
    else process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST = prevRequire;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  }
});

test('evaluateHarnessProfileIntegrity enforces production allowlist for specialized digests', () => {
  const prevAllowlist = process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
  const prevRequire = process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
  const prevNodeEnv = process.env.NODE_ENV;
  delete process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
  delete process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
  process.env.NODE_ENV = 'production';
  try {
    const missingList = evaluateHarnessProfileIntegrity({
      lane: 'agent_harness',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      framework: 'codex',
    });
    assert.equal(missingList.ok, false);
    assert.ok(missingList.issues.some((issue) => issue.code === 'image_allowlist_required'));

    process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST =
      'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const ok = evaluateHarnessProfileIntegrity({
      lane: 'agent_harness',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      framework: 'codex',
    });
    assert.equal(ok.ok, true);

    process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST =
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const notListed = evaluateHarnessProfileIntegrity({
      lane: 'agent_harness',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      framework: 'codex',
    });
    assert.equal(notListed.ok, false);
    assert.ok(notListed.issues.some((issue) => issue.code === 'image_digest_not_allowlisted'));
  } finally {
    if (prevAllowlist === undefined) delete process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST;
    else process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST = prevAllowlist;
    if (prevRequire === undefined) delete process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST;
    else process.env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST = prevRequire;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  }
});

test('composition hash mismatch fails integrity', () => {
  const result = evaluateHarnessProfileIntegrity({
    lane: 'agent_harness',
    installation: 'fresh',
    skills: [],
    framework: 'codex',
    compositionHash: 'deadbeef',
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'composition_hash_mismatch'));
});
