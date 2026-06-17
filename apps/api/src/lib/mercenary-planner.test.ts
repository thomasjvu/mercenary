import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMercenaryPlannerOverrides,
  parsePlannerModelOutputForTest,
  planMercenaryChatHeuristicForTest,
  readMercenaryBaseModel,
} from './mercenary-planner.js';

test('readMercenaryBaseModel defaults to e2ee-gemma-4-31b', () => {
  assert.equal(readMercenaryBaseModel({}), 'e2ee-gemma-4-31b');
  assert.equal(
    readMercenaryBaseModel({ BOSSRAID_MERCENARY_BASE_MODEL: 'custom-model' }),
    'custom-model'
  );
});

test('planMercenaryChatHeuristic routes greetings to direct replies', () => {
  const decision = planMercenaryChatHeuristicForTest('yo');
  assert.equal(decision.action, 'direct');
  assert.match(decision.reply ?? '', /Mercenary here/i);
});

test('planMercenaryChatHeuristic routes scoped work to raids', () => {
  const decision = planMercenaryChatHeuristicForTest(
    'Build a one-room GB Studio microgame with a boss and trailer.'
  );
  assert.equal(decision.action, 'raid');
});

test('parsePlannerModelOutput accepts fenced JSON', () => {
  const parsed = parsePlannerModelOutputForTest(
    '```json\n{"action":"direct","reply":"Hello from Mercenary."}\n```'
  );
  assert.deepEqual(parsed, {
    action: 'direct',
    reply: 'Hello from Mercenary.',
    raidPolicyOverrides: undefined,
  });
});

test('applyMercenaryPlannerOverrides maps planner fields onto raid constraints', () => {
  const raidRequest = {
    taskTitle: 'Task',
    taskDescription: 'Desc',
    language: 'text' as const,
    files: [],
    failingSignals: { errors: [] },
    constraints: {
      numExperts: 2,
      maxBudgetUsd: 8,
      maxLatencySec: 30,
      allowExternalSearch: false,
      requireSpecializations: [],
      minReputation: 0,
    },
    rewardPolicy: { splitStrategy: 'equal_success_only' as const },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
  };

  const next = applyMercenaryPlannerOverrides(raidRequest, {
    maxAgents: 4,
    maxTotalCost: 20,
    requiredCapabilities: ['analysis'],
  });

  assert.equal(next.constraints.numExperts, 4);
  assert.equal(next.constraints.maxBudgetUsd, 20);
  assert.deepEqual(next.constraints.requireSpecializations, ['analysis']);
});
