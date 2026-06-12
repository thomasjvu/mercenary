import assert from 'node:assert/strict';
import test from 'node:test';
import elliptic from 'elliptic';
import { encryptMessage, encryptMessagesForE2ee, isHexEncrypted } from './venice-e2ee.js';

const MODEL_PUBLIC_KEY = new elliptic.ec('secp256k1').genKeyPair().getPublic('hex');

test('venice e2ee encrypt produces ciphertext hex', () => {
  const ciphertext = encryptMessage('hello strict-private lane', MODEL_PUBLIC_KEY);
  assert.equal(isHexEncrypted(ciphertext), true);
});

test('venice e2ee encrypts user and system messages only', () => {
  const encrypted = encryptMessagesForE2ee(
    [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user prompt' },
      { role: 'assistant', content: 'prior answer' },
    ],
    MODEL_PUBLIC_KEY
  );
  assert.equal(isHexEncrypted(encrypted[0].content), true);
  assert.equal(isHexEncrypted(encrypted[1].content), true);
  assert.equal(encrypted[2].content, 'prior answer');
});
