import test from 'node:test';
import assert from 'node:assert/strict';
import { rejectClientSuppliedEscrowProof } from './bounty-fund-security.js';

test('rejects client-supplied escrow proof when x402 is enabled', () => {
  const result = rejectClientSuppliedEscrowProof({
    env: { NODE_ENV: 'development' },
    x402Enabled: true,
    fundBody: {
      openNow: true,
      escrowJobId: 'forged-job',
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.error, 'client_escrow_proof_rejected');
  }
});

test('allows omitted escrow proof in local unverified mode', () => {
  const result = rejectClientSuppliedEscrowProof({
    env: { NODE_ENV: 'development', BOSSRAID_X402_ENABLED: 'false' },
    x402Enabled: false,
    fundBody: { openNow: true },
  });
  assert.equal(result.ok, true);
});
