import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveChatTerminalSettleGraceMs } from './index.js';

test('resolveChatTerminalSettleGraceMs honors BOSSRAID_INVITE_ACCEPT_MS with floor and cap', () => {
  assert.equal(resolveChatTerminalSettleGraceMs({}), 5_000);
  assert.equal(
    resolveChatTerminalSettleGraceMs({ BOSSRAID_INVITE_ACCEPT_MS: '2000' } as NodeJS.ProcessEnv),
    5_000
  );
  assert.equal(
    resolveChatTerminalSettleGraceMs({ BOSSRAID_INVITE_ACCEPT_MS: '7000' } as NodeJS.ProcessEnv),
    7_000
  );
  assert.equal(
    resolveChatTerminalSettleGraceMs({ BOSSRAID_INVITE_ACCEPT_MS: '45000' } as NodeJS.ProcessEnv),
    30_000
  );
});
