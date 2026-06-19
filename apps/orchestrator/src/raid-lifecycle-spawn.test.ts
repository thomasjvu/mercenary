import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import {
  createProviderProfile,
  createSpawnInput,
  createTestOrchestrator,
} from './index.test-helpers.js';

test('spawnReservedRaid coalesces concurrent spawns for one reservation', async () => {
  const orchestrator = createTestOrchestrator([
    {
      profile: createProviderProfile('provider-alpha'),
      async accept(): Promise<ProviderAcceptance> {
        return { accepted: true, providerRunId: 'run-race' };
      },
      async run(_task: ProviderTaskPackage): Promise<void> {
        return;
      },
    },
  ]);
  const input = createSpawnInput();
  const reservation = await orchestrator.reserveRaidLaunch(input, {
    route: 'raid',
    requestKey: 'spawn-race-key',
  });

  const [first, second] = await Promise.all([
    orchestrator.spawnReservedRaid(reservation.id, reservation.requestKey),
    orchestrator.spawnReservedRaid(reservation.id, reservation.requestKey),
  ]);

  assert.equal(first.raidId, second.raidId);
  assert.equal(orchestrator.listRaids().length, 1);
});
