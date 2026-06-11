import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveDemoPayload } from './default-payload.js';

test('buildLiveDemoPayload routes greetings to native chat demo shape', () => {
  const payload = buildLiveDemoPayload('Hi Mercenary. What can you help with?');
  assert.equal(payload.taskType, 'analysis');
  assert.equal(payload.output.primaryType, 'text');
  assert.equal(payload.raidPolicy.maxAgents, 1);
  assert.match(payload.task.description, /User:\nHi Mercenary/);
});

test('buildLiveDemoPayload routes seeded game builds to the game demo shape', () => {
  const payload = buildLiveDemoPayload(
    'Build a one-room GB Studio microgame with one boss, pixel art, and a trailer.'
  );
  assert.equal(payload.taskType, 'game_build');
  assert.equal(payload.output.primaryType, 'patch');
  assert.ok(payload.task.files.length > 0);
  assert.equal(payload.raidPolicy.maxAgents, 3);
});
