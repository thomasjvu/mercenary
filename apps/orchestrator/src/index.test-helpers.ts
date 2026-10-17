import { setImmediate } from 'node:timers/promises';
import type { RaidRecord } from '@bossraid/shared-types';
import {
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  readyHealth,
  waitFor,
} from '@bossraid/test-fixtures';
import { BossRaidOrchestrator } from './index.js';
import { createTestOrchestrator, FAST_TEST_TIMING } from './test-orchestrator.js';

export {
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  createTestOrchestrator,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
};

export function collectRaidTree(orchestrator: BossRaidOrchestrator, raidId: string): RaidRecord[] {
  const raid = orchestrator.getRaid(raidId);
  if (!raid) {
    return [];
  }

  return [
    raid,
    ...(raid.childRaidIds ?? []).flatMap((childRaidId) =>
      collectRaidTree(orchestrator, childRaidId)
    ),
  ];
}

// Failure modes: mocked setTimeout stalls timer-based polling, while wall-clock
// deadlines can expire during async imports/evaluation on a busy test runner.
// Yield real event-loop turns without moving the scenario's virtual clock.
export async function waitForWithFrozenClock(
  predicate: () => boolean,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) {
      throw new Error('Timed out waiting for condition with frozen clock.');
    }
    await setImmediate();
  }
}
