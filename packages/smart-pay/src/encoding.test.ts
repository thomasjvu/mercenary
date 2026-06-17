import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeBase64Json } from './encoding.js';
import { encodeDelegationChain } from './x402.js';

test('encodeBase64Json round-trips JSON payloads', () => {
  const payload = { chain: [{ type: 'erc7710_delegation', at: '2026-06-17T00:00:00.000Z' }] };
  const encoded = encodeBase64Json(payload);
  const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as typeof payload;
  assert.deepEqual(decoded, payload);
});

test('encodeDelegationChain returns base64 JSON for delegation entries', () => {
  const encoded = encodeDelegationChain([
    {
      type: 'erc7710_delegation',
      at: '2026-06-17T00:00:00.000Z',
      summary: 'Direct ERC-7710 delegation for one-shot raid payment.',
    },
  ]);
  const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as unknown[];
  assert.equal(Array.isArray(decoded), true);
  assert.equal((decoded[0] as { type: string }).type, 'erc7710_delegation');
});
