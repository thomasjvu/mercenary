import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import {
  collectMatchedSpecializations,
  providerMatchesAllowedModelFamilies,
  providerMatchesTask,
  selectProviders,
  taskUsesVenicePrivateLane,
} from './selection.js';

test('providerMatchesTask rejects providers missing required output types', () => {
  const task = createSpawnInput();
  const provider = createProviderProfile('provider-text-only', {
    outputTypes: ['text'],
  });

  assert.equal(providerMatchesTask(provider, task), false);
});

test('collectMatchedSpecializations includes framework and language for patch tasks', () => {
  const task = createSpawnInput();
  const provider = createProviderProfile('provider-react', {
    specializations: ['debugging'],
    supportedFrameworks: ['react'],
    supportedLanguages: ['typescript'],
  });

  assert.deepEqual(collectMatchedSpecializations(provider, task).sort(), ['react', 'typescript']);
});

test('selectProviders prefers Venice-backed providers in strict private lane tasks', () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      privacyMode: 'strict' as const,
      allowedModelFamilies: ['venice-private'],
    },
  };
  const veniceProvider = createProviderProfile('provider-venice', {
    modelFamily: 'venice-private',
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
  });
  const standardProvider = createProviderProfile('provider-standard', {
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
    trust: {
      score: 99,
      source: 'erc8004',
    },
  });

  const selection = selectProviders(task, [standardProvider, veniceProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-venice');
});

test('providerMatchesAllowedModelFamilies is case-insensitive', () => {
  const provider = createProviderProfile('provider-family', { modelFamily: 'Venice' });

  assert.equal(providerMatchesAllowedModelFamilies(provider, ['venice']), true);
  assert.equal(providerMatchesAllowedModelFamilies(provider, ['openai']), false);
});

test('selectProviders fails closed when strict private lane has no Venice-backed providers', () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      privacyMode: 'strict' as const,
      allowedModelFamilies: ['venice-private'],
    },
  };
  const standardProvider = createProviderProfile('provider-standard', {
    privacy: {
      noDataRetention: true,
      teeAttested: true,
      e2ee: true,
    },
  });

  const selection = selectProviders(task, [standardProvider], 60_000);
  assert.equal(selection.primaries.length, 0);
  assert.equal(selection.reserves.length, 0);
});

test('taskUsesVenicePrivateLane detects strict privacy and venice families', () => {
  const strictTask = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      privacyMode: 'strict' as const,
    },
  };
  const veniceFamilyTask = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      allowedModelFamilies: ['venice-private'],
    },
  };

  assert.equal(taskUsesVenicePrivateLane(strictTask), true);
  assert.equal(taskUsesVenicePrivateLane(veniceFamilyTask), true);
  assert.equal(taskUsesVenicePrivateLane(createSpawnInput()), false);
});
