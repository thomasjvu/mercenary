import assert from 'node:assert/strict';
import test from 'node:test';
import { countProvidersWithSignal } from './routing.js';
import { hasErc8004Registration } from './erc8004.js';
import { selectApprovedProviderIds } from './raid-result.js';
import { raidPollingRefreshInterval } from './polling.js';

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
