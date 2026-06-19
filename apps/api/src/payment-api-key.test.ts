import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiControlState } from './control-state.js';

test('reserveBuyerApiKeyLaunch rejects second reservation beyond spend cap', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000001');
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'test',
    keyHash: 'hash_test',
    prefix: 'br_test',
    spendLimitUsd: 5,
  });

  const first = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 3);
  assert.ok(first);
  const second = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 3);
  assert.equal(second, undefined);

  if (first) {
    controlState.releaseBuyerApiKeyReservation(first);
  }
});

test('reserveBuyerApiKeyLaunch rejects spend-cap bypass via prepaid balance', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000003');
  controlState.creditBuyerBalance(account.wallet, 20);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'capped',
    keyHash: 'hash_capped',
    prefix: 'br_cap',
    spendLimitUsd: 5,
  });

  const first = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 3);
  assert.ok(first);
  const second = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 3);
  assert.equal(second, undefined);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 17);

  if (first) {
    controlState.releaseBuyerApiKeyReservation(first);
  }
});

test('finalizeBuyerApiKeyBilling refunds unused reservation to balance', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000002');
  controlState.creditBuyerBalance(account.wallet, 10);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'test',
    keyHash: 'hash_test2',
    prefix: 'br_test2',
  });

  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 5);
  assert.ok(reservation);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 5);

  const ok = controlState.finalizeBuyerApiKeyBilling(reservation!, 2);
  assert.equal(ok, true);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 8);
});
