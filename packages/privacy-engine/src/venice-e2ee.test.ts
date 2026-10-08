import assert from 'node:assert/strict';
import test from 'node:test';
import { createECDH, createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import {
  encryptMessage,
  encryptMessagesForE2ee,
  isHexEncrypted,
  decryptChunk,
  generateE2eeSession,
} from './venice-e2ee.js';

const model = createECDH('secp256k1');
model.generateKeys();
const MODEL_PUBLIC_KEY = model.getPublicKey('hex', 'uncompressed');

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

test('Venice ciphertext decrypts with independent Node ECDH/HKDF/AES-GCM', () => {
  for (const publicKey of [
    MODEL_PUBLIC_KEY,
    MODEL_PUBLIC_KEY.slice(2),
    model.getPublicKey('hex', 'compressed'),
  ]) {
    const plaintext = 'Hello private world 🌍';
    const raw = Buffer.from(encryptMessage(plaintext, publicKey), 'hex');
    const shared = model.computeSecret(raw.subarray(0, 65));
    const aesKey = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), 'ecdsa_encryption', 32));
    const cipher = createDecipheriv('aes-256-gcm', aesKey, raw.subarray(65, 77));
    cipher.setAuthTag(raw.subarray(-16));
    const result = Buffer.concat([cipher.update(raw.subarray(77, -16)), cipher.final()]);
    assert.equal(result.toString('utf8'), plaintext);
  }
});

test('Venice session decrypts Node-encrypted replies and rejects modified payloads', () => {
  const session = generateE2eeSession(MODEL_PUBLIC_KEY);
  const ephemeral = createECDH('secp256k1');
  ephemeral.generateKeys();
  const shared = ephemeral.computeSecret(Buffer.from(session.publicKeyHex, 'hex'));
  const aesKey = Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), 'ecdsa_encryption', 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, nonce);
  const plaintext = 'Encrypted reply 🌍';
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const raw = Buffer.concat([ephemeral.getPublicKey(), nonce, ciphertext, cipher.getAuthTag()]);
  assert.equal(decryptChunk(raw.toString('hex'), session.privateKey), plaintext);
  raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
  assert.throws(() => decryptChunk(raw.toString('hex'), session.privateKey));
  assert.throws(() => decryptChunk('00', session.privateKey));
  assert.throws(() => encryptMessage('hello', '04' + '00'.repeat(64)));
});
