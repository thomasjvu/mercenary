import assert from 'node:assert/strict';
import test from 'node:test';
import { pollRaidSnapshot } from './polling.js';

test('pollRaidSnapshot retains successful reads when another read fails', async () => {
  const failure = new Error('Result is not ready');
  const snapshot = await pollRaidSnapshot({
    fetchStatus: async () => ({ status: 'running' }),
    fetchResult: async () => {
      throw failure;
    },
    fetchAgentLog: async () => ['provider_dispatched'],
  });

  assert.deepEqual(snapshot.status, { status: 'fulfilled', value: { status: 'running' } });
  assert.deepEqual(snapshot.result, { status: 'rejected', reason: failure });
  assert.deepEqual(snapshot.agentLog, { status: 'fulfilled', value: ['provider_dispatched'] });
});

test('pollRaidSnapshot supports callers without an agent log', async () => {
  const snapshot = await pollRaidSnapshot({
    fetchStatus: async () => 'completed',
    fetchResult: async () => ({ answer: 'done' }),
  });

  assert.deepEqual(snapshot.status, { status: 'fulfilled', value: 'completed' });
  assert.deepEqual(snapshot.result, { status: 'fulfilled', value: { answer: 'done' } });
  assert.equal(snapshot.agentLog, undefined);
});

test('pollRaidSnapshot starts every read before waiting for completion', async () => {
  const started: string[] = [];
  let finishStatus!: (status: string) => void;
  const pendingStatus = new Promise<string>((resolve) => {
    finishStatus = resolve;
  });
  const pendingSnapshot = pollRaidSnapshot({
    fetchStatus: () => {
      started.push('status');
      return pendingStatus;
    },
    fetchResult: async () => {
      started.push('result');
      return 'done';
    },
    fetchAgentLog: async () => {
      started.push('agentLog');
      return [];
    },
  });

  assert.deepEqual(started, ['status', 'result', 'agentLog']);
  finishStatus('completed');
  const snapshot = await pendingSnapshot;
  assert.deepEqual(snapshot.status, { status: 'fulfilled', value: 'completed' });
});
