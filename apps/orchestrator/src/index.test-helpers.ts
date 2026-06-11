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

export {
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
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
