import assert from 'node:assert/strict';
import test from 'node:test';
import { isLowSignalChatPrompt } from '../mercenary-chat.js';
import { humanizeStatus, isTerminalRaidStatus } from '../mercenary-format.js';
import { buildAgentLogPath, buildAttestedRuntimePath } from '../mercenary-paths.js';
import type { LiveRaidRun } from '../mercenary-result.js';

test('humanizeStatus replaces separators with spaces', () => {
  assert.equal(humanizeStatus('first_valid'), 'first valid');
  assert.equal(humanizeStatus('tee-attested'), 'tee attested');
});

test('isTerminalRaidStatus recognizes terminal raid states', () => {
  assert.equal(isTerminalRaidStatus('final'), true);
  assert.equal(isTerminalRaidStatus('cancelled'), true);
  assert.equal(isTerminalRaidStatus('running'), false);
});

test('isLowSignalChatPrompt detects greetings and joke prompts', () => {
  assert.equal(isLowSignalChatPrompt('Hi Mercenary'), true);
  assert.equal(isLowSignalChatPrompt('tell me another joke'), true);
  assert.equal(isLowSignalChatPrompt('Build a GB Studio microgame with a boss'), false);
});

test('mercenary API path builders preserve raid access tokens', () => {
  const run: LiveRaidRun = {
    spawn: {
      raidId: 'raid_demo_1',
      raidAccessToken: 'token_demo',
      receiptPath: '/v1/raids/raid_demo_1/receipt',
      status: 'queued',
      selectedExperts: 1,
      reserveExperts: 0,
      estimatedFirstResultSec: 25,
      sanitization: {
        riskTier: 'low',
        redactedSecrets: 0,
        redactedIdentifiers: 0,
        trimmedFiles: 0,
      },
    },
    startedAtMs: Date.now(),
  };

  assert.match(buildAgentLogPath(run), /raid_demo_1/);
  assert.match(buildAgentLogPath(run), /token_demo/);
  assert.match(buildAttestedRuntimePath(), /\/v1\/attested-runtime$/);
});
