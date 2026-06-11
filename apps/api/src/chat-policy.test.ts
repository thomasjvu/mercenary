import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer, resolveChatTerminalSettleGraceMs } from './index.js';
import { createProviderProfile, readyHealth } from './test/helpers.js';

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
