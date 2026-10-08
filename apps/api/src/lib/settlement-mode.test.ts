import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSettlementGateConfigured,
  isFullOnchainSettlementConfigured,
} from './settlement-mode.js';
import { ROBINHOOD_USDG_ADDRESS } from '@bossraid/constants';

const configured = {
  BOSSRAID_RPC_URL: 'https://rpc.example',
  BOSSRAID_CHAIN_ID: '4663',
  BOSSRAID_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000001',
  BOSSRAID_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000002',
  BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000003',
  BOSSRAID_TOKEN_ADDRESS: ROBINHOOD_USDG_ADDRESS,
  BOSSRAID_CLIENT_PRIVATE_KEY: `0x${'12'.repeat(32)}`,
  BOSSRAID_EVALUATOR_ADDRESS: '0x0000000000000000000000000000000000000004',
};

test('off and file settlement do not require onchain configuration', () => {
  assert.equal(isSettlementGateConfigured('off', {}), true);
  assert.equal(isSettlementGateConfigured('file', {}), true);
});

test('production settlement requires mainnet USDG and well-formed configuration', () => {
  const production = { ...configured, NODE_ENV: 'production' };
  assert.equal(isFullOnchainSettlementConfigured(production), true);
  for (const [key, value] of Object.entries({
    BOSSRAID_CHAIN_ID: '46630',
    BOSSRAID_TOKEN_ADDRESS: configured.BOSSRAID_ESCROW_ADDRESS,
    BOSSRAID_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000000',
    BOSSRAID_BOUNTY_ESCROW_ADDRESS: 'placeholder',
    BOSSRAID_RPC_URL: 'not-a-url',
    BOSSRAID_CLIENT_PRIVATE_KEY: `0x${'00'.repeat(32)}`,
  })) {
    assert.equal(isFullOnchainSettlementConfigured({ ...production, [key]: value }), false, key);
  }
  assert.equal(
    isFullOnchainSettlementConfigured({ ...configured, BOSSRAID_CHAIN_ID: '46630' }),
    true
  );
});

test('onchain settlement requires every configured field', () => {
  assert.equal(isSettlementGateConfigured('onchain', configured), true);
  for (const field of Object.keys(configured)) {
    const incomplete: NodeJS.ProcessEnv = { ...configured };
    delete incomplete[field];
    assert.equal(isSettlementGateConfigured('onchain', incomplete), false, field);
  }
});
