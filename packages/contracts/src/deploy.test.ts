import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { resolveBountyOperatorAddress } from './resolve-bounty-operator.js';

const DEPLOYER = '0x0000000000000000000000000000000000000001';
const OPERATOR = '0x0000000000000000000000000000000000000002';

test('resolveBountyOperatorAddress prefers explicit operator address', () => {
  assert.equal(
    resolveBountyOperatorAddress({
      deployerAddress: DEPLOYER,
      operatorAddress: OPERATOR,
    }),
    OPERATOR
  );
});

test('resolveBountyOperatorAddress derives operator from client private key', () => {
  const clientPrivateKey = generatePrivateKey();
  const clientAddress = privateKeyToAccount(clientPrivateKey).address;

  assert.equal(
    resolveBountyOperatorAddress({
      deployerAddress: DEPLOYER,
      clientPrivateKey,
    }),
    clientAddress
  );
});

test('resolveBountyOperatorAddress falls back to deployer address', () => {
  assert.equal(
    resolveBountyOperatorAddress({
      deployerAddress: DEPLOYER,
    }),
    DEPLOYER
  );
});
