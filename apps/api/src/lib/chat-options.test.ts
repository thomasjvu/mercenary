import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChatOptionsToBody, extractChatOptionsFromTask } from './chat-options.js';

test('extractChatOptionsFromTask reads reasoning_effort and sampling', () => {
  const options = extractChatOptionsFromTask({
    files: [
      {
        path: '.bossraid/chat-options.json',
        content: JSON.stringify({
          model: 'grok-4.5',
          max_tokens: 2048,
          temperature: 0.2,
          reasoning_effort: 'high',
        }),
      },
    ],
  });
  assert.equal(options.model, 'grok-4.5');
  assert.equal(options.max_tokens, 2048);
  assert.equal(options.temperature, 0.2);
  assert.equal(options.reasoning_effort, 'high');
});

test('extractChatOptionsFromTask ignores invalid effort and missing file', () => {
  assert.deepEqual(extractChatOptionsFromTask({ files: [] }), {});
  const options = extractChatOptionsFromTask({
    files: [
      {
        path: '.bossraid/chat-options.json',
        content: JSON.stringify({ reasoning_effort: 'nope', max_tokens: 0.5 }),
      },
    ],
  });
  assert.equal(options.reasoning_effort, undefined);
  assert.equal(options.max_tokens, 1);
});

test('applyChatOptionsToBody merges OpenAI fields', () => {
  const body = applyChatOptionsToBody(
    { model: 'grok-4.5', messages: [], max_tokens: 16 },
    { max_tokens: 512, temperature: 0.1, reasoning_effort: 'low' }
  );
  assert.equal(body.max_tokens, 512);
  assert.equal(body.temperature, 0.1);
  assert.equal(body.reasoning_effort, 'low');
});

test('extractChatOptionsFromTask reads multi-turn messages', () => {
  const options = extractChatOptionsFromTask({
    files: [
      {
        path: '.bossraid/chat-options.json',
        content: JSON.stringify({
          messages: [
            { role: 'system', content: 'Be brief.' },
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
            { role: 'user', content: 'again' },
          ],
        }),
      },
    ],
  });
  assert.equal(options.messages?.length, 4);
  assert.equal(options.messages?.[3]?.content, 'again');
});
