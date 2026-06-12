import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidRecord } from '@bossraid/shared-types';
import { resolveMinimumPayoutThresholdUsd } from './settlement-threshold.js';

test('resolveMinimumPayoutThresholdUsd uses inference floor for single-provider marketplace raids', () => {
  const raid = {
    selectedProviders: ['provider-a'],
    task: {
      constraints: {
        numExperts: 1,
        allowedModelIds: ['gpt-5.5'],
        selectionMode: 'cost_first',
      },
    },
  } as RaidRecord;

  assert.equal(resolveMinimumPayoutThresholdUsd(raid), 0.01);
});

test('resolveMinimumPayoutThresholdUsd keeps multi-agent threshold from env default', () => {
  const raid = {
    selectedProviders: ['provider-a', 'provider-b'],
    task: {
      constraints: {
        numExperts: 2,
        allowedModelIds: ['gpt-5.5'],
        selectionMode: 'best_match',
      },
    },
  } as RaidRecord;

  assert.equal(resolveMinimumPayoutThresholdUsd(raid), 0.25);
});
