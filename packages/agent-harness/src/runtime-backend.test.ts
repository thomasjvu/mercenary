import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHarnessImageAllowed } from './image-allowlist.js';
import { resolveHarnessRuntimeBackend } from './runtime-backend.js';

test('resolveHarnessRuntimeBackend auto stays openai_tools without native flag', () => {
  assert.equal(
    resolveHarnessRuntimeBackend('claude_code', { BOSSRAID_HARNESS_RUNTIME_BACKEND: 'auto' }),
    'openai_tools'
  );
  assert.equal(
    resolveHarnessRuntimeBackend('codex', {
      BOSSRAID_HARNESS_RUNTIME_BACKEND: 'auto',
      BOSSRAID_HARNESS_NATIVE_SDK: '1',
    }),
    'codex_sdk'
  );
  assert.equal(
    resolveHarnessRuntimeBackend('claude_code', {
      BOSSRAID_HARNESS_NATIVE_SDK: 'require',
    }),
    'claude_agent_sdk'
  );
  assert.equal(
    resolveHarnessRuntimeBackend('grok', { BOSSRAID_HARNESS_NATIVE_SDK: '1' }),
    'openai_tools'
  );
});

test('assertHarnessImageAllowed requires digest for specialized seats', () => {
  const blocked = assertHarnessImageAllowed(
    {
      kind: 'codex',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
    },
    {}
  );
  assert.equal(blocked.ok, false);

  const allowlisted = assertHarnessImageAllowed(
    {
      kind: 'codex',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    {
      BOSSRAID_HARNESS_IMAGE_ALLOWLIST:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }
  );
  assert.equal(allowlisted.ok, true);

  const notOnList = assertHarnessImageAllowed(
    {
      kind: 'codex',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    {
      BOSSRAID_HARNESS_IMAGE_ALLOWLIST:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }
  );
  assert.equal(notOnList.ok, false);
});

test('assertHarnessImageAllowed fails specialized without allowlist in production', () => {
  const digest = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  const productionEmpty = assertHarnessImageAllowed(
    {
      kind: 'codex',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: digest,
    },
    { NODE_ENV: 'production' }
  );
  assert.equal(productionEmpty.ok, false);

  const devEmptyOk = assertHarnessImageAllowed(
    {
      kind: 'codex',
      installation: 'skill_augmented',
      skills: [{ id: 'raid-pixel' }],
      imageDigest: digest,
    },
    { NODE_ENV: 'test' }
  );
  assert.equal(devEmptyOk.ok, true);
  if (devEmptyOk.ok) {
    assert.equal(devEmptyOk.mode, 'empty_allowlist_dev');
  }
});
