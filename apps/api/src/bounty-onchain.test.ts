import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deadlineUnix,
  hexToBytes32,
  isBountyOnchainConfigured,
  requiresProductionBountyEscrow,
  usdToAtomic,
} from './lib/bounty-onchain.js';
import type { BountyRecord } from '@bossraid/shared-types';

test('usdToAtomic converts USD to USDC atomic units', () => {
  assert.equal(usdToAtomic(1), 1_000_000n);
  assert.equal(usdToAtomic(0.25), 250_000n);
});

test('hexToBytes32 left-pads sha256 hex to bytes32', () => {
  assert.equal(hexToBytes32('abc123'), `0x${'0'.repeat(58)}abc123`);
});

test('deadlineUnix maps ISO deadlines to unix seconds', () => {
  const bounty = {
    deadlines: {
      biddingDeadlineAt: '2026-06-18T00:00:00.000Z',
      awardDeadlineAt: '2026-06-19T00:00:00.000Z',
      deliveryDeadlineAt: '2026-06-20T00:00:00.000Z',
      acceptDeadlineAt: '2026-06-21T00:00:00.000Z',
    },
  } as BountyRecord;
  const deadlines = deadlineUnix(bounty);
  assert.equal(deadlines.bidding, 1_781_740_800n);
  assert.equal(deadlines.accept, 1_782_000_000n);
});

test('isBountyOnchainConfigured requires onchain mode and bounty escrow env', () => {
  assert.equal(
    isBountyOnchainConfigured({
      BOSSRAID_SETTLEMENT_MODE: 'off',
      BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000001',
      BOSSRAID_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000002',
      BOSSRAID_RPC_URL: 'http://localhost',
      BOSSRAID_CHAIN_ID: '84532',
      BOSSRAID_CLIENT_PRIVATE_KEY: '0x11',
    }),
    false
  );
  assert.equal(
    isBountyOnchainConfigured({
      BOSSRAID_SETTLEMENT_MODE: 'onchain',
      BOSSRAID_BOUNTY_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000001',
      BOSSRAID_TOKEN_ADDRESS: '0x0000000000000000000000000000000000000002',
      BOSSRAID_RPC_URL: 'http://localhost',
      BOSSRAID_CHAIN_ID: '84532',
      BOSSRAID_CLIENT_PRIVATE_KEY: '0x11',
    }),
    true
  );
});

test('requiresProductionBountyEscrow is true only in production onchain mode', () => {
  assert.equal(
    requiresProductionBountyEscrow({
      NODE_ENV: 'production',
      BOSSRAID_SETTLEMENT_MODE: 'onchain',
    }),
    true
  );
  assert.equal(
    requiresProductionBountyEscrow({
      NODE_ENV: 'development',
      BOSSRAID_SETTLEMENT_MODE: 'onchain',
    }),
    false
  );
});
