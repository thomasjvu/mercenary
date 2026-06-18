import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { RaidRecord, SettlementExecutionRecord } from '@bossraid/shared-types';
import { buildArtifactPath, type SettlementArtifact } from './settlement-artifacts.js';
import {
  executeSettlement,
  shouldRunSettlement,
  type OrchestratorSettlementRunnerDeps,
} from './orchestrator-settlement-runner.js';

function createFinalRaid(overrides: Partial<RaidRecord> = {}): RaidRecord {
  return {
    id: 'raid_1',
    status: 'final',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadlineUnix: Math.floor(Date.now() / 1000) + 3600,
    task: {
      title: 'task',
      description: 'desc',
      constraints: { privacyMode: 'off' },
      budgetUsd: 10,
      minimumPayoutThresholdUsd: 1,
      platformMarkupRate: 0,
    },
    selectedProviders: ['provider-alpha'],
    assignments: {},
    rankedSubmissions: [],
    reputationEvents: [],
    ...overrides,
  } as RaidRecord;
}

function createPartialSettlement(): SettlementExecutionRecord {
  return {
    mode: 'onchain',
    proofStandard: 'erc8183_aligned',
    lifecycleStatus: 'partial',
    executedAt: new Date().toISOString(),
    artifactPath: '/tmp/raid_1.settlement.json',
    registryRaidRef: '7',
    taskHash: '0xtaskhash',
    evaluationHash: '0xevaluationhash',
    successfulProviderIds: ['provider-alpha'],
    allocations: [],
    contracts: {
      registryAddress: '0x0000000000000000000000000000000000000101',
      escrowAddress: '0x0000000000000000000000000000000000000102',
      tokenAddress: null,
      clientAddress: '0x0000000000000000000000000000000000000104',
      evaluatorAddress: '0x0000000000000000000000000000000000000105',
      chainId: '8453',
      rpcUrl: 'https://rpc.example',
    },
    registryCall: {
      method: 'finalizeRaid',
      args: ['7', '0xevaluationhash'],
    },
    childJobs: [],
    warnings: ['awaiting evaluator completion'],
  };
}

test('shouldRunSettlement retries partial onchain settlement for final root raids', () => {
  const raid = createFinalRaid({
    settlementExecution: createPartialSettlement(),
  });

  assert.equal(shouldRunSettlement(raid), true);
});

test('shouldRunSettlement skips terminal settlement records', () => {
  const raid = createFinalRaid({
    settlementExecution: {
      ...createPartialSettlement(),
      lifecycleStatus: 'terminal',
    },
  });

  assert.equal(shouldRunSettlement(raid), false);
});

test('executeSettlement resumes partial settlement instead of starting fresh', async () => {
  const raid = createFinalRaid({
    settlementExecution: createPartialSettlement(),
  });
  const raids = new Map([[raid.id, raid]]);
  let resumed = false;

  const deps: OrchestratorSettlementRunnerDeps = {
    requireRaid: (raidId) => {
      const found = raids.get(raidId);
      if (!found) {
        throw new Error(`missing raid ${raidId}`);
      }
      return found;
    },
    providers: new Map(),
    settlementExecutor: {
      execute: async () => {
        throw new Error('execute should not run for partial settlement');
      },
      resume: async () => {
        resumed = true;
        return {
          ...createPartialSettlement(),
          lifecycleStatus: 'terminal',
        };
      },
    },
    queuePersist: async () => undefined,
  };

  await executeSettlement(raid.id, deps);

  assert.equal(resumed, true);
  assert.equal(raid.settlementExecution?.lifecycleStatus, 'terminal');
});

test('executeSettlement recovers partial artifact checkpoints after executor failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-settlement-runner-'));
  const raid = createFinalRaid();
  const raids = new Map([[raid.id, raid]]);
  const artifactPath = buildArtifactPath(dir, raid.id);
  const artifact: SettlementArtifact = {
    raidId: raid.id,
    executedAt: new Date().toISOString(),
    mode: 'onchain',
    lifecycleStatus: 'partial',
    registryRaidRef: '3',
    taskHash: '0xtaskhash',
    evaluationHash: '0xevaluationhash',
    successfulProviderIds: [],
    settlement: {
      successfulProviderCount: 0,
      successfulProvidersPaid: 0,
      payoutPerSuccessfulProvider: 0,
      escrowFundingUsd: 0,
      platformMarkupUsd: 0,
      minimumPayoutThresholdUsd: 1,
      approvedProviderCount: 0,
    },
    allocations: [],
    contracts: {
      registryAddress: '0x0000000000000000000000000000000000000101',
      escrowAddress: '0x0000000000000000000000000000000000000102',
      tokenAddress: null,
      clientAddress: '0x0000000000000000000000000000000000000104',
      evaluatorAddress: '0x0000000000000000000000000000000000000105',
      chainId: '8453',
      rpcUrl: 'https://rpc.example',
    },
    registryCall: {
      method: 'finalizeRaid',
      args: ['3', '0xevaluationhash'],
    },
    childJobs: [],
    transactionHashes: ['0xabc'],
    jobIds: [],
    warnings: ['checkpointed before failure'],
  };
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  const deps: OrchestratorSettlementRunnerDeps = {
    requireRaid: (raidId) => raids.get(raidId)!,
    providers: new Map(),
    settlementOutputDir: dir,
    settlementExecutor: {
      execute: async () => {
        throw new Error('createRaid failed after checkpoint');
      },
      resume: async () => undefined,
    },
    queuePersist: async () => undefined,
  };

  await assert.rejects(() => executeSettlement(raid.id, deps), /createRaid failed/);
  assert.equal(raid.settlementExecution?.lifecycleStatus, 'partial');
  assert.equal(raid.settlementExecution?.registryRaidRef, '3');
  assert.equal(raid.settlementExecution?.artifactPath, artifactPath);
});
