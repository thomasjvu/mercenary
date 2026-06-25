import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashQuote,
  normalizeQuoteHex,
  verifyIntelQuote,
  verifyQuoteWithPhalaCloud,
} from './quote-verify.js';

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

test('normalizeQuoteHex accepts hex and base64 quote encodings', () => {
  const bytes = Buffer.alloc(160, 2);
  assert.equal(normalizeQuoteHex(bytes.toString('hex')), bytes.toString('hex'));
  assert.equal(normalizeQuoteHex(`0x${bytes.toString('hex')}`), bytes.toString('hex'));
  assert.equal(normalizeQuoteHex(bytes.toString('base64')), bytes.toString('hex'));
});

test('verifyQuoteWithPhalaCloud posts hex payloads and maps verified cloud responses', async () => {
  const quote = Buffer.alloc(160, 2).toString('base64');
  let postedBody = '';
  const result = await verifyQuoteWithPhalaCloud(quote, {
    verifyUrl: 'https://cloud.test/verify',
    fetchImpl: async (_url, init) => {
      postedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ success: true, quote: { verified: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(JSON.parse(postedBody).hex, Buffer.alloc(160, 2).toString('hex'));
  assert.equal(result.passed, true);
  assert.match(result.detail, /succeeded/i);
});

test('verifyQuoteWithPhalaCloud accepts structural validation on non-PoC nodes', async () => {
  const quote = Buffer.alloc(160, 3).toString('hex');
  const result = await verifyQuoteWithPhalaCloud(quote, {
    verifyUrl: 'https://cloud.test/verify',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ success: true, proof_of_cloud: false, quote: { verified: false } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      ),
  });

  assert.equal(result.passed, true);
  assert.match(result.detail, /structural validation passed/i);
});
