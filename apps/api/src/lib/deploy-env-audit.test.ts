import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readEnabledUpstreamMocks } from './production-readiness.js';
import { ROBINHOOD_USDG_ADDRESS } from '@bossraid/constants';

const script = fileURLToPath(
  new URL('../../../../scripts/audit-production-deploy-env.mjs', import.meta.url)
);
const productionEnv = {
  NODE_ENV: 'production',
  BOSSRAID_SETTLEMENT_MODE: 'onchain',
  BOSSRAID_CHAIN_ID: '4663',
  BOSSRAID_TOKEN_ADDRESS: ROBINHOOD_USDG_ADDRESS,
  BOSSRAID_X402_ENABLED: 'true',
  BOSSRAID_SETTLEMENT_FUND_JOBS: 'true',
  BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS: 'true',
  BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000201',
  BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET: 'ci-audit-secret',
  BOSSRAID_SECRET_ENCRYPTION_KEY: 'ci-audit-encryption-key',
};

function audit(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [script], {
    env: { ...productionEnv, ...overrides },
    encoding: 'utf8',
    timeout: 5_000,
  });
}

test('static production audit rejects every runtime upstream mock', () => {
  assert.equal(audit().status, 0);
  const source = [
    'UPSTREAM',
    'UPSTREAM_TEE',
    'VENICE',
    'REDPILL',
    'NEAR',
    'CHUTES',
    'PHALA',
    'XAI',
    'ZAI',
    'ANTHROPIC',
    'NEBIUS',
    'OPENAI',
  ];
  const keys = [...source.map((name) => `BOSSRAID_${name}_MOCK`), 'BOSSRAID_PROVIDER_STUB_MODE'];
  const mocked = Object.fromEntries(keys.map((key) => [key, 'true']));
  assert.deepEqual(readEnabledUpstreamMocks(mocked).sort(), keys.sort());
  for (const key of keys) {
    const result = audit({ [key]: 'true' });
    assert.equal(result.status, 1, key);
    assert.ok(result.stderr.includes(key), key);
  }
});

test('static production audit rejects privacy and quote verification bypasses', () => {
  for (const [key, value] of Object.entries({
    BOSSRAID_PRIVACY_SERVER_VERIFY: '0',
    BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY: '1',
  })) {
    assert.equal(audit({ [key]: value }).status, 1, key);
  }
});

test('static production audit rejects testnet settlement and x402 rails', () => {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'development',
    BOSSRAID_CHAIN_ID: '46630',
    BOSSRAID_X402_NETWORK: 'eip155:46630',
    BOSSRAID_X402_ASSET: 'usdc',
    BOSSRAID_TOKEN_ADDRESS: productionEnv.BOSSRAID_BOUNTY_ESCROW_ADDRESS,
  })) {
    assert.equal(audit({ [key]: value }).status, 1, key);
  }
});
