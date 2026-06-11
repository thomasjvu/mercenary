import assert from 'node:assert/strict';
import test from 'node:test';
import { isLowSignalChatPrompt } from './demo-chat.js';

test('isLowSignalChatPrompt detects greetings and expanded joke prompts', () => {
  assert.equal(isLowSignalChatPrompt('Hi Mercenary'), true);
  assert.equal(isLowSignalChatPrompt('tell me another joke'), true);
  assert.equal(isLowSignalChatPrompt('Build a GB Studio microgame with a boss'), false);
});
