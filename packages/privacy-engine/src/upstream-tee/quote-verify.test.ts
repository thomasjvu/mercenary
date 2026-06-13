import assert from 'node:assert/strict';
import test from 'node:test';
import { hashQuote, verifyIntelQuote, verifyQuoteWithPhalaCloud } from './quote-verify.js';

test('verifyIntelQuote accepts mock quotes only in mock mode', () => {
  assert.equal(verifyIntelQuote('mock-intel-quote', { mockMode: true }).passed, true);
  assert.equal(verifyIntelQuote('mock-intel-quote', { mockMode: false }).passed, false);
});

test('verifyIntelQuote validates encoded TDX quote payloads', () => {
  const quote = Buffer.alloc(160, 1).toString('base64');
  const result = verifyIntelQuote(quote);
  assert.equal(result.passed, true);
  assert.equal(result.quoteHash, hashQuote(quote));
});

test('verifyQuoteWithPhalaCloud maps verified cloud responses', async () => {
  const quote = Buffer.alloc(160, 2).toString('base64');
  const result = await verifyQuoteWithPhalaCloud(quote, {
    verifyUrl: 'https://cloud.test/verify',
    fetchImpl: async () =>
      new Response(JSON.stringify({ verified: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  assert.equal(result.passed, true);
  assert.match(result.detail, /succeeded/i);
});
