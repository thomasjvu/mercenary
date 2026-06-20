import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChildJobNextAction, isTerminalChildJobStatus } from '@bossraid/raid-core';
import {
  DEFAULT_JOB_EXPIRY_SEC,
  normalizePrivateKey,
  OnchainSettlementExecutor,
} from './settlement-onchain-executor.js';

test('OnchainSettlementExecutor exposes configured job expiry default', () => {
  assert.equal(DEFAULT_JOB_EXPIRY_SEC > 0, true);
});

test('buildChildJobNextAction reports pending funded child job action', () => {
  const action = buildChildJobNextAction('complete', 'funded', 1_000_000n);
  assert.match(action ?? '', /Provider submit is still required/);
});

test('OnchainSettlementExecutor constructor accepts minimal onchain config', () => {
  const executor = new OnchainSettlementExecutor('/tmp/settlement', {
    rpcUrl: 'http://127.0.0.1:8545',
    registryAddress: '0x0000000000000000000000000000000000000101',
    escrowAddress: '0x0000000000000000000000000000000000000102',
    evaluatorAddress: '0x0000000000000000000000000000000000000103',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    chainId: '84532',
  });
  assert.equal(typeof executor, 'object');
});

test('normalizePrivateKey accepts 0x-prefixed 32-byte keys', () => {
  const normalized = normalizePrivateKey(
    '0x0000000000000000000000000000000000000000000000000000000000000001'
  );
  assert.equal(normalized, '0x0000000000000000000000000000000000000000000000000000000000000001');
});

test('isTerminalChildJobStatus recognizes completed and non-terminal funded jobs', () => {
  assert.equal(isTerminalChildJobStatus('completed'), true);
  assert.equal(isTerminalChildJobStatus('funded'), false);
  assert.equal(isTerminalChildJobStatus('expired'), true);
});
