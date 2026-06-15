import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWalletError } from './ethereum-provider.js';

test('formatWalletError maps user rejection to a friendly message', () => {
  assert.equal(
    formatWalletError(new Error('User rejected the request.')),
    'Wallet request cancelled.'
  );
});
