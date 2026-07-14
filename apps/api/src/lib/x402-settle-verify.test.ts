import assert from 'node:assert/strict';
import test from 'node:test';
import { usdToAtomicUsdg, verifyX402SettlementOnchain } from './x402-settle-verify.js';
import type { X402Config, X402PaymentRequired, X402SettlementResponse } from '../x402-config.js';

test('usdToAtomicUsdg converts dollars to 6-decimal atomic units', () => {
  assert.equal(usdToAtomicUsdg(1).toString(), '1000000');
  assert.equal(usdToAtomicUsdg(0.01).toString(), '10000');
  assert.equal(usdToAtomicUsdg(1.5).toString(), '1500000');
});

test('verifyX402SettlementOnchain skips RPC when unset outside production', async () => {
  const config = {
    enabled: true,
    network: 'eip155:4663',
    asset: 'usdg',
    payTo: '0x1111111111111111111111111111111111111111',
    resourceBaseUrl: 'http://127.0.0.1:8787',
    maxTimeoutSeconds: 90,
    platformMarkupBps: 100,
    routeSurchargeUsd: { raid: 0, chat: 0, inference: 0, balance: 0, bounty: 0 },
    assetTransferMethod: 'permit2',
  } as X402Config;

  const paymentRequired = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'robinhood',
        maxAmountRequired: '1000000',
        resource: 'http://127.0.0.1:8787/v1/raid',
        description: 'test',
        mimeType: 'application/json',
        payTo: config.payTo,
        maxTimeoutSeconds: 90,
        asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      },
    ],
  } as X402PaymentRequired;

  const settlement = {
    success: true,
    transaction: '0xabc',
  } as X402SettlementResponse;

  const result = await verifyX402SettlementOnchain({
    config,
    paymentRequired,
    settlement,
    env: { NODE_ENV: 'test' },
  });
  assert.equal(result.ok, true);
});

test('verifyX402SettlementOnchain fails without tx when production requires verify', async () => {
  const config = {
    enabled: true,
    network: 'eip155:4663',
    asset: 'usdg',
    payTo: '0x1111111111111111111111111111111111111111',
    resourceBaseUrl: 'http://127.0.0.1:8787',
    maxTimeoutSeconds: 90,
    platformMarkupBps: 100,
    routeSurchargeUsd: { raid: 0, chat: 0, inference: 0, balance: 0, bounty: 0 },
    assetTransferMethod: 'permit2',
  } as X402Config;

  const paymentRequired = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'robinhood',
        maxAmountRequired: '1000000',
        resource: 'http://127.0.0.1:8787/v1/raid',
        description: 'test',
        mimeType: 'application/json',
        payTo: config.payTo,
        maxTimeoutSeconds: 90,
        asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      },
    ],
  } as X402PaymentRequired;

  const result = await verifyX402SettlementOnchain({
    config,
    paymentRequired,
    settlement: { success: true },
    env: { NODE_ENV: 'production' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /transaction hash/i);
  }
});
