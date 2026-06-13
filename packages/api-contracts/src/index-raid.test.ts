import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, parseBossRaidRequest } from './index.js';
import { parseBossRaidSpawnInput } from './parsers/raid-spawn.js';
import { createBossRaidRequestPayload, createSpawnInputPayload } from './index.test-helpers.js';

test('parseBossRaidRequest honors raid_policy.max_latency_sec', () => {
  const parsed = parseBossRaidRequest({
    ...createBossRaidRequestPayload(),
    raidPolicy: {
      ...createBossRaidRequestPayload().raidPolicy,
      maxLatencySec: 42,
    },
  });

  assert.equal(parsed.constraints.maxLatencySec, 42);
});

test('parseBossRaidRequest rejects unsupported task languages', () => {
  assert.throws(
    () =>
      parseBossRaidRequest({
        ...createBossRaidRequestPayload(),
        task: {
          ...createBossRaidRequestPayload().task,
          language: 'ruby',
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Unsupported language for task.language.'
  );
});

test('parseBossRaidRequest requires an explicit payout budget', () => {
  assert.throws(
    () =>
      parseBossRaidRequest({
        ...createBossRaidRequestPayload(),
        raidPolicy: {
          maxAgents: 1,
          privacyMode: 'prefer',
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Expected finite number for raid_policy.max_total_cost.'
  );
});

test('parseBossRaidSpawnInput rejects unsupported host values', () => {
  assert.throws(
    () =>
      parseBossRaidSpawnInput({
        ...createSpawnInputPayload(),
        hostContext: {
          host: 'unknown-host',
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Unsupported host for host_context.host.'
  );
});
