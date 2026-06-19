import assert from 'node:assert/strict';
import test from 'node:test';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { BossRaidResultOutput, BossRaidStatusOutput } from '@bossraid/shared-types';
import {
  ChatTerminalWaitError,
  isTerminalChatOutcome,
  pollForTerminalChatOutcome,
} from './chat-terminal-wait.js';

function buildStatus(status: BossRaidStatusOutput['status']): BossRaidStatusOutput {
  return {
    raidId: 'raid-timeout',
    status,
    experts: [],
    firstValidAvailable: false,
    sanitization: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: 'safe',
      issues: [],
    },
  };
}

function buildResult(status: BossRaidResultOutput['status'] = 'running'): BossRaidResultOutput {
  return {
    raidId: 'raid-timeout',
    status,
    approvedSubmissions: [],
    rankedSubmissions: [],
  };
}

test('pollForTerminalChatOutcome throws when raid stays non-terminal', async () => {
  const orchestrator = {
    getStatus: () => buildStatus('running'),
    getResult: () => buildResult('running'),
    getRaid: () => ({ settlementExecution: { id: 'settle-1' } }),
  } as unknown as BossRaidOrchestrator;

  await assert.rejects(
    () =>
      pollForTerminalChatOutcome(orchestrator, 'raid-timeout', {
        timeoutMs: 50,
        settleGraceMs: 25,
        settlementMode: 'file',
      }),
    ChatTerminalWaitError
  );
});

test('isTerminalChatOutcome recognizes terminal raid states', () => {
  assert.equal(
    isTerminalChatOutcome({ status: buildStatus('final'), result: buildResult() }),
    true
  );
  assert.equal(
    isTerminalChatOutcome({ status: buildStatus('running'), result: buildResult() }),
    false
  );
});
