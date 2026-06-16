import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldLaunchOnComposerKey } from './mercenary-composer.js';

test('shouldLaunchOnComposerKey submits on Enter without Shift', () => {
  assert.equal(shouldLaunchOnComposerKey('Enter', false), true);
  assert.equal(shouldLaunchOnComposerKey('Enter', true), false);
  assert.equal(shouldLaunchOnComposerKey('Tab', false), false);
});
