import assert from 'node:assert/strict';
import test from 'node:test';
import { isTeeProductionConfigured } from './tee.js';

const socketReady = { pathExists: true, socketMounted: true };
const socketMissing = { pathExists: false, socketMounted: false };

test('Phala production requires MNEMONIC when socket is mounted', () => {
  assert.equal(
    isTeeProductionConfigured(
      {
        NODE_ENV: 'production',
        BOSSRAID_TEE_PLATFORM: 'phala',
        MNEMONIC: '',
      },
      socketReady
    ),
    false
  );

  assert.equal(
    isTeeProductionConfigured(
      {
        NODE_ENV: 'production',
        BOSSRAID_TEE_PLATFORM: 'phala',
        MNEMONIC: 'test test test test test test test test test test test junk',
      },
      socketReady
    ),
    true
  );
});

test('Phala development allows socket-only readiness without MNEMONIC', () => {
  assert.equal(
    isTeeProductionConfigured(
      {
        NODE_ENV: 'development',
        BOSSRAID_TEE_PLATFORM: 'phala',
        MNEMONIC: '',
      },
      socketReady
    ),
    true
  );
});

test('non-Phala production still requires MNEMONIC', () => {
  assert.equal(
    isTeeProductionConfigured(
      {
        NODE_ENV: 'production',
        BOSSRAID_TEE_PLATFORM: 'local',
        MNEMONIC: '',
      },
      socketMissing
    ),
    false
  );

  assert.equal(
    isTeeProductionConfigured(
      {
        NODE_ENV: 'production',
        BOSSRAID_TEE_PLATFORM: 'local',
        MNEMONIC: 'test test test test test test test test test test test junk',
      },
      socketMissing
    ),
    true
  );
});
