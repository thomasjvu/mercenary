import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiControlState } from '../control-state.js';

test('releaseBuyerApiKeyReservation is idempotent: double release credits balance once', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000010');
  controlState.creditBuyerBalance(account.wallet, 10);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'idempotent-release',
    keyHash: 'hash_idempotent_release',
    prefix: 'br_ir',
  });

  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 4);
  assert.ok(reservation);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 6);
  assert.equal(controlState.listBuyerApiKeys(account.wallet)[0]?.spentUsd, 4);

  controlState.releaseBuyerApiKeyReservation(reservation!);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 10);
  assert.equal(controlState.listBuyerApiKeys(account.wallet)[0]?.spentUsd, 0);
  assert.equal(reservation!.released, true);
  assert.equal(reservation!.reservedUsd, 0);

  // Second release must not double-credit prepaid balance or under-count spend.
  controlState.releaseBuyerApiKeyReservation(reservation!);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 10);
  assert.equal(controlState.listBuyerApiKeys(account.wallet)[0]?.spentUsd, 0);
});
