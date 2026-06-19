import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import type { FastifyReply } from 'fastify';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { BossRaidResultOutput, BossRaidStatusOutput } from '@bossraid/shared-types';
import { streamChatCompletionResponse } from './chat-stream.js';
import { ChatTerminalWaitError } from './chat-terminal-wait.js';

function buildStatus(status: BossRaidStatusOutput['status']): BossRaidStatusOutput {
  return {
    raidId: 'raid-stream',
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
    raidId: 'raid-stream',
    status,
    approvedSubmissions: [],
    rankedSubmissions: [],
  };
}

test('streamChatCompletionResponse invokes onFailure when terminal wait times out', async () => {
  const orchestrator = {
    getStatus: () => buildStatus('running'),
    getResult: () => buildResult('running'),
    getRaid: () => ({ settlementExecution: { id: 'settle-1' } }),
  } as unknown as BossRaidOrchestrator;

  const failures: string[] = [];
  let failureDone: (() => void) | undefined;
  const failureSettled = new Promise<void>((resolve) => {
    failureDone = resolve;
  });
  const stream = new PassThrough();
  const reply = {
    code: () => reply,
    header: () => reply,
    send: () => stream,
  } as unknown as FastifyReply;

  void streamChatCompletionResponse(reply, orchestrator, {
    chatRequest: {
      model: 'mercenary-v1',
      messages: [{ role: 'user', content: 'hello' }],
    },
    raidRequest: {
      constraints: { maxLatencySec: 0.05 },
    } as never,
    spawn: {
      raidId: 'raid-stream',
      raidAccessToken: 'token',
      receiptPath: '/verification?raidId=raid-stream',
      selectedExperts: 1,
    },
    created: 1,
    settleGraceMs: 25,
    settlementMode: 'file',
    onFailure: async (error) => {
      failures.push(error.name);
      failureDone?.();
    },
  });

  await failureSettled;
  assert.deepEqual(failures, [ChatTerminalWaitError.name]);
});

test('streamChatCompletionResponse invokes onFailure when billing capture fails', async () => {
  const orchestrator = {
    getStatus: () => buildStatus('final'),
    getResult: () => ({
      ...buildResult('final'),
      synthesizedOutput: {
        patchUnifiedDiff: 'diff',
        baseSubmissionProviderId: 'provider-1',
      },
      approvedSubmissions: [],
    }),
    getRaid: () => ({ settlementExecution: { id: 'settle-1' } }),
  } as unknown as BossRaidOrchestrator;

  const failures: string[] = [];
  let failureDone: (() => void) | undefined;
  const failureSettled = new Promise<void>((resolve) => {
    failureDone = resolve;
  });
  const stream = new PassThrough();
  const reply = {
    code: () => reply,
    header: () => reply,
    send: () => stream,
  } as unknown as FastifyReply;

  void streamChatCompletionResponse(reply, orchestrator, {
    chatRequest: {
      model: 'mercenary-v1',
      messages: [{ role: 'user', content: 'hello' }],
    },
    raidRequest: {
      constraints: { maxLatencySec: 1 },
    } as never,
    spawn: {
      raidId: 'raid-stream',
      raidAccessToken: 'token',
      receiptPath: '/verification?raidId=raid-stream',
      selectedExperts: 1,
    },
    created: 1,
    settleGraceMs: 25,
    settlementMode: 'file',
    bossraidBilling: {
      capture: async () => {
        throw new Error('capture_failed');
      },
    },
    onFailure: async (error) => {
      failures.push(error.message);
      failureDone?.();
    },
  });

  await failureSettled;
  assert.deepEqual(failures, ['capture_failed']);
});
