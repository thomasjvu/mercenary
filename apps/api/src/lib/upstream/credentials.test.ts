import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMarketplaceTeeApiKey } from './credentials.js';

const platformEnv: NodeJS.ProcessEnv = { BOSSRAID_VENICE_API_KEY: 'test-platform-key' };

function keyReader(keys: Record<string, string> = {}) {
  const wallets: string[] = [];
  return {
    wallets,
    controlState: {
      readSellerUpstreamApiKey(wallet: string) {
        wallets.push(wallet);
        return keys[wallet];
      },
    },
  };
}

test('marketplace TEE uses the seller wallet before the session wallet', () => {
  const reader = keyReader({ seller: 'test-seller-key', buyer: 'test-buyer-key' });
  const key = resolveMarketplaceTeeApiKey({
    ...reader,
    provider: 'venice',
    env: platformEnv,
    sellerId: 'seller-seat',
    sellerWallet: 'seller',
    sessionWallet: 'buyer',
  });
  assert.equal(key, 'test-seller-key');
  assert.deepEqual(reader.wallets, ['seller']);
});

test('a seller without a key falls back to the platform rather than another wallet', () => {
  const reader = keyReader({ buyer: 'test-buyer-key' });
  assert.equal(
    resolveMarketplaceTeeApiKey({
      ...reader,
      provider: 'venice',
      env: platformEnv,
      sellerId: 'seller-seat',
      sellerWallet: 'seller',
      sessionWallet: 'buyer',
    }),
    'test-platform-key'
  );
  assert.deepEqual(reader.wallets, ['seller']);
});

test('session keys take precedence with and without a platform key', () => {
  for (const env of [platformEnv, {}]) {
    const reader = keyReader({ buyer: 'test-buyer-key' });
    assert.equal(
      resolveMarketplaceTeeApiKey({ ...reader, provider: 'venice', env, sessionWallet: 'buyer' }),
      'test-buyer-key'
    );
    assert.deepEqual(reader.wallets, ['buyer']);
  }
});

test('missing session keys use the platform key when configured', () => {
  for (const env of [platformEnv, {}]) {
    const reader = keyReader();
    assert.equal(
      resolveMarketplaceTeeApiKey({ ...reader, provider: 'venice', env, sessionWallet: 'buyer' }),
      env.BOSSRAID_VENICE_API_KEY
    );
  }
});

test('unsupported providers never read a wallet key', () => {
  const reader = keyReader({ buyer: 'test-buyer-key' });
  assert.equal(
    resolveMarketplaceTeeApiKey({
      ...reader,
      provider: 'unsupported',
      env: platformEnv,
      sessionWallet: 'buyer',
    }),
    undefined
  );
  assert.deepEqual(reader.wallets, []);
});
