import assert from 'node:assert/strict';
import test from 'node:test';
import { erc20MinimalAbi } from './settlement-onchain-abi.js';

test('erc20 minimal abi supports escrow funding approvals', () => {
  const names = erc20MinimalAbi.map((item) => item.name);
  assert.deepEqual(names, ['allowance', 'approve']);
});
