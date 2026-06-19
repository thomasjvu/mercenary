import assert from 'node:assert/strict';
import test from 'node:test';
import { erc20MinimalAbi } from './settlement-onchain-abi.js';

test('erc20 minimal abi is shared from raid-core', () => {
  const names = erc20MinimalAbi.map((item) => item.name);
  assert.deepEqual(names, ['allowance', 'approve', 'balanceOf']);
});

test('OnchainSettlementExecutor is exported for settlement runner wiring', async () => {
  const { OnchainSettlementExecutor } = await import('./settlement-onchain-executor.js');
  assert.equal(typeof OnchainSettlementExecutor, 'function');
});
