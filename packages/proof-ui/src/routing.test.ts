import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProviderProofNote, buildRoutingDecisionSummary } from './routing.js';

test('buildRoutingDecisionSummary includes phase, workstream, and privacy signals', () => {
  const summary = buildRoutingDecisionSummary({
    providerId: 'provider-alpha',
    phase: 'primary',
    workstreamLabel: 'Gameplay',
    roleLabel: 'Gameplay Core',
    veniceBacked: true,
    erc8004Registered: true,
    erc8004VerificationStatus: 'verified',
    trustScore: 82,
    privacyFeatures: ['tee_attested'],
    reasons: ['selected_primary', 'venice_private_lane', 'specialization_match'],
  });

  assert.match(summary, /primary · Gameplay \/ Gameplay Core/);
  assert.match(summary, /venice/);
  assert.match(summary, /trust 82/);
  assert.match(summary, /why venice private lane \/ specialization match/);
});

test('buildProviderProofNote labels profile tee flags as claimed', () => {
  const note = buildProviderProofNote(undefined, {
    privacy: { teeAttested: true },
  });

  assert.match(note, /tee claimed/);
  assert.doesNotMatch(note, /tee attested/);
});

test('buildRoutingDecisionSummary falls back to root raid label', () => {
  const summary = buildRoutingDecisionSummary({
    phase: 'reserve',
    reasons: ['reserved_fallback'],
  });

  assert.match(summary, /reserve · root raid/);
  assert.doesNotMatch(summary, /why reserved fallback/);
});
