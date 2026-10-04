import assert from 'node:assert/strict';
import test from 'node:test';
import { isSettlementGateConfigured } from './settlement-mode.js';

const configured = {
  BOSSRAID_RPC_URL: 'https://rpc.example',
  BOSSRAID_CHAIN_ID: '4663',
  BOSSRAID_REGISTRY_ADDRESS: 'registry',
  BOSSRAID_ESCROW_ADDRESS: 'escrow',
  BOSSRAID_BOUNTY_ESCROW_ADDRESS: 'bounty',
  BOSSRAID_TOKEN_ADDRESS: 'token',
  BOSSRAID_CLIENT_PRIVATE_KEY: 'test-placeholder',
  BOSSRAID_EVALUATOR_ADDRESS: 'evaluator',
};

test('off and file settlement do not require onchain configuration', () => {
  assert.equal(isSettlementGateConfigured('off', {}), true);
  assert.equal(isSettlementGateConfigured('file', {}), true);
});

test('onchain settlement requires every configured field', () => {
  assert.equal(isSettlementGateConfigured('onchain', configured), true);
  for (const field of Object.keys(configured)) {
    const incomplete: NodeJS.ProcessEnv = { ...configured };
    delete incomplete[field];
    assert.equal(isSettlementGateConfigured('onchain', incomplete), false, field);
  }
});
