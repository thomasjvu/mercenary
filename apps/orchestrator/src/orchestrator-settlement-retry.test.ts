import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidRecord, SettlementExecutionRecord } from '@bossraid/shared-types';
import { shouldRunSettlement } from './orchestrator-settlement-runner.js';

function createFinalRaid(overrides: Partial<RaidRecord> = {}): RaidRecord {
  return {
    id: 'raid-settlement-retry',
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
    artifactPath: '/tmp/raid-settlement-retry.settlement.json',
    registryRaidRef: '3',
    taskHash: '0xtask',
    evaluationHash: '0xeval',
    successfulProviderIds: [],
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
      args: ['3', '0xeval'],
    },
    childJobs: [],
    transactionHashes: ['0xabc'],
    jobIds: [],
    warnings: ['checkpointed before failure'],
  };
}

test('failed partial settlement raids remain eligible for retry queue', () => {
  const raid = createFinalRaid({
    settlementExecution: createPartialSettlement(),
  });

  assert.equal(shouldRunSettlement(raid), true);

  const pending = new Set<string>();
  if (shouldRunSettlement(raid)) {
    pending.add(raid.id);
  }

  assert.deepEqual([...pending], ['raid-settlement-retry']);
});
