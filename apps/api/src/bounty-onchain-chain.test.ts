import assert from 'node:assert/strict';
import test from 'node:test';
import { BountyOnchainExecutor, createBountyOnchainExecutor } from './lib/bounty-onchain.js';

test('createBountyOnchainExecutor returns null when onchain bounty config is incomplete', () => {
  assert.equal(
    createBountyOnchainExecutor({
      BOSSRAID_SETTLEMENT_MODE: 'off',
    }),
    null
  );
});

test('BountyOnchainExecutor is constructible with valid onchain config', () => {
  const executor = createBountyOnchainExecutor({
    BOSSRAID_SETTLEMENT_MODE: 'onchain',
    BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000201',
    BOSSRAID_TOKEN_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    BOSSRAID_RPC_URL: 'http://127.0.0.1:8545',
    BOSSRAID_CHAIN_ID: '84532',
    BOSSRAID_CLIENT_PRIVATE_KEY:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
  });
  assert.ok(executor instanceof BountyOnchainExecutor);
});
