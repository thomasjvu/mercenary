import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider } from './api';
import {
  buildProviderNote,
  buildProviderProofTags,
  countProofTag,
  countTeeAttestedSpecialists,
} from './mercenary-specialist-tags.js';
import type { ConversationSpecialistRecord } from './mercenary-specialist-types.js';

test('buildProviderNote prefers specializations', () => {
  const provider = {
    providerId: 'seller-a',
    displayName: 'Seller A',
    status: 'available',
    specializations: ['patch', 'text', 'promo'],
    pricePerTaskUsd: 1,
    modelFamily: 'gpt',
  } as Provider;

  assert.match(buildProviderNote(provider, undefined), /patch/);
});

test('buildProviderProofTags includes tee and verification tags', () => {
  const provider = {
    providerId: 'seller-a',
    displayName: 'Seller A',
    status: 'available',
    specializations: [],
    pricePerTaskUsd: 1,
    modelFamily: 'gpt',
    privacy: { teeAttested: true, signedOutputs: true },
    erc8004: { verification: { status: 'verified' } },
  } as Provider;

  const tags = buildProviderProofTags(provider, {
    providerId: 'seller-a',
    privacyFeatures: ['e2ee'],
    erc8004Registered: true,
    erc8004VerificationStatus: 'verified',
    veniceBacked: false,
    phase: 'primary',
    reasons: [],
    matchedSpecializations: [],
  });

  assert.ok(tags.includes('TEE'));
  assert.ok(tags.includes('signed'));
  assert.ok(tags.includes('8004'));
  assert.equal(tags.length, 3);
});

test('countProofTag helpers tally specialist proof tags', () => {
  const specialists: ConversationSpecialistRecord[] = [
    {
      providerId: 'a',
      displayName: 'A',
      statusLabel: 'ready',
      statusTone: 'ready',
      note: '',
      meta: '',
      progressValue: null,
      proofTags: ['TEE', 'signed'],
    },
    {
      providerId: 'b',
      displayName: 'B',
      statusLabel: 'ready',
      statusTone: 'ready',
      note: '',
      meta: '',
      progressValue: null,
      proofTags: ['signed'],
    },
  ];

  assert.equal(countTeeAttestedSpecialists(specialists), 1);
  assert.equal(countProofTag(specialists, 'signed'), 2);
});
