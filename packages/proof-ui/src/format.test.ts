import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMs, formatTimestamp, formatUsd, shortValue, uniqueStrings } from './format.js';
import { countProvidersWithSignal } from './routing.js';
import { buildErc8004ProofLabel, hasErc8004Registration } from './erc8004.js';
import { selectApprovedProviderIds } from './raid-result.js';
import { raidPollingRefreshInterval } from './polling.js';

test('shortValue truncates long strings', () => {
  assert.equal(shortValue('short'), 'short');
  assert.equal(shortValue('abcdefghijklmnopqrstuvwxyz'), 'abcdefgh…stuvwxyz');
});

test('uniqueStrings drops blanks and duplicates', () => {
  assert.deepEqual(uniqueStrings(['a', 'a', '', 'b']), ['a', 'b']);
});

test('formatUsd handles nullish and precision', () => {
  assert.equal(formatUsd(undefined), '$0.00');
  assert.equal(formatUsd(1.2345, 3), '$1.234');
});

test('formatMs and formatTimestamp render stable labels', () => {
  assert.equal(formatMs(undefined), 'n/a');
  assert.equal(formatMs(42), '42 ms');
  assert.equal(formatTimestamp(undefined), 'n/a');
  assert.match(formatTimestamp('2026-06-11T12:34:56.000Z'), /Jun/);
});

test('countProvidersWithSignal groups by provider map entries', () => {
  const map = new Map([
    ['p1', [{ providerId: 'p1', veniceBacked: true }]],
    ['p2', [{ providerId: 'p2', veniceBacked: false }]],
  ]);

  assert.equal(
    countProvidersWithSignal(map, (decision) => decision.veniceBacked === true),
    1
  );
});

test('hasErc8004Registration requires registration tx', () => {
  assert.equal(hasErc8004Registration(undefined), false);
  assert.equal(hasErc8004Registration({ erc8004: { registrationTx: '0xabc' } }), true);
});

test('buildErc8004ProofLabel supports short and long styles', () => {
  assert.equal(buildErc8004ProofLabel('verified', true), '8004 verified');
  assert.equal(buildErc8004ProofLabel('verified', true, { style: 'long' }), 'erc8004 verified');
});

test('selectApprovedProviderIds prefers settlement execution ids', () => {
  assert.deepEqual(
    selectApprovedProviderIds({
      settlementExecution: { successfulProviderIds: ['p1', 'p1'] },
      approvedSubmissions: [{ submission: { providerId: 'p2' } }],
    }),
    ['p1']
  );
});

test('raidPollingRefreshInterval stops on terminal status', () => {
  assert.equal(
    raidPollingRefreshInterval({ enabled: true, status: 'final', intervalMs: 2_000 }),
    0
  );
  assert.equal(
    raidPollingRefreshInterval({ enabled: true, status: 'running', intervalMs: 2_000 }),
    2_000
  );
});
