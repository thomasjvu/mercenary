import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider, RaidResult } from '../api';
import {
  buildReceiptProviderRows,
  pickPreviewArtifacts,
  readQueryErrorMessage,
  summarizeCanonicalOutput,
} from './receipt-helpers.js';

const provider: Provider = {
  providerId: 'seller-a',
  displayName: 'Seller A',
  status: 'available',
  specializations: ['text'],
  pricePerTaskUsd: 1,
  modelFamily: 'gpt',
};

const result = {
  synthesizedOutput: {
    answerText: 'Canonical answer for the raid.',
    artifacts: [
      { type: 'image', url: 'https://example.com/preview.png', mimeType: 'image/png' },
      { type: 'text', content: 'notes' },
    ],
    contributingProviderIds: ['seller-a'],
    supportingProviderIds: [],
    droppedProviderIds: [],
  },
  routingProof: {
    providers: [
      {
        providerId: 'seller-a',
        roleLabel: 'author',
        workstreamLabel: 'draft',
        reasons: ['matched'],
        phase: 'primary',
        privacyFeatures: ['tee_attested'],
        erc8004Registered: true,
        erc8004VerificationStatus: 'verified',
        veniceBacked: false,
        matchedSpecializations: ['text'],
        modelFamily: 'gpt',
      },
    ],
  },
} as unknown as RaidResult;

test('pickPreviewArtifacts keeps only renderable media', () => {
  const artifacts = result.synthesizedOutput?.artifacts ?? [];
  const preview = pickPreviewArtifacts(artifacts);
  assert.equal(preview.length, 1);
  assert.equal(preview[0]?.type, 'image');
});

test('summarizeCanonicalOutput prefers canonical text', () => {
  assert.match(summarizeCanonicalOutput(result), /Canonical answer/);
  assert.equal(summarizeCanonicalOutput(undefined), 'Loading receipt proof.');
});

test('buildReceiptProviderRows maps routing decisions to rows', () => {
  const routingDecisionMap = new Map([['seller-a', result.routingProof!.providers]]);
  const rows = buildReceiptProviderRows(
    ['seller-a'],
    routingDecisionMap,
    new Map([[provider.providerId, provider]]),
    ['seller-a'],
    [],
    []
  );

  assert.equal(rows[0]?.state, 'approved');
  assert.equal(rows[0]?.displayName, 'Seller A');
  assert.match(rows[0]?.assignment, /draft/);
});

test('readQueryErrorMessage normalizes unknown errors', () => {
  assert.equal(readQueryErrorMessage(new Error('boom')), 'boom');
  assert.equal(readQueryErrorMessage('nope'), 'Request failed.');
});
