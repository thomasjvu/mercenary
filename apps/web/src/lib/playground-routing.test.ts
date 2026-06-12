import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlaygroundUrl, readPlaygroundMode } from './playground-routing.js';

test('readPlaygroundMode resolves raid from query string', () => {
  assert.equal(readPlaygroundMode('?mode=raid'), 'raid');
  assert.equal(readPlaygroundMode('?mode=inference'), 'inference');
  assert.equal(readPlaygroundMode('?model=gpt-5.5'), 'inference');
});

test('buildPlaygroundUrl preserves model and mode', () => {
  assert.equal(
    buildPlaygroundUrl({ mode: 'raid', modelId: 'gpt-5.5' }),
    '/playground?mode=raid&model=gpt-5.5'
  );
  assert.equal(
    buildPlaygroundUrl({ mode: 'inference', modelId: 'gpt-5.5' }),
    '/playground?model=gpt-5.5'
  );
  assert.equal(
    buildPlaygroundUrl({ mode: 'inference', search: '?mode=raid&model=gpt-5.5' }),
    '/playground?model=gpt-5.5'
  );
  assert.equal(
    buildPlaygroundUrl({ mode: 'raid', search: '?model=gpt-5.5' }),
    '/playground?mode=raid&model=gpt-5.5'
  );
});
