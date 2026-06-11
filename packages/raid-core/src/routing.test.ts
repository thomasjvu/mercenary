import assert from 'node:assert/strict';
import test from 'node:test';
import type { RankedSubmission } from '@bossraid/shared-types';
import { createProviderProfile, createSpawnInput } from '@bossraid/test-fixtures';
import { annotateRoutingProof, buildRoutingProof, rankSubmissions } from './routing.js';
import { selectProviders } from './selection.js';

test('buildRoutingProof records policy and selected providers', () => {
  const task = createSpawnInput();
  const provider = createProviderProfile('provider-alpha');
  const selected = selectProviders(task, [provider], 60_000);

  const proof = buildRoutingProof(task, selected);

  assert.equal(proof.policy.privacyMode, task.constraints.privacyMode);
  assert.equal(proof.providers.length, selected.primaries.length + selected.reserves.length);
  assert.equal(proof.providers[0]?.phase, 'primary');
  assert.ok(proof.providers[0]?.reasons.includes('selected_primary'));
});

test('annotateRoutingProof adds workstream scope to routing decisions', () => {
  const task = createSpawnInput();
  const provider = createProviderProfile('provider-alpha');
  const selected = selectProviders(task, [provider], 60_000);
  const proof = buildRoutingProof(task, selected);

  const annotated = annotateRoutingProof(proof, {
    providerIndex: 0,
    totalExperts: 1,
    workstreamId: 'answer',
    workstreamLabel: 'Answer',
    workstreamObjective: 'Explain the bug directly.',
    roleId: 'answer-core',
    roleLabel: 'Answer Core',
    roleObjective: 'Explain the bug directly.',
    prompt: 'Explain the bug directly.',
  });

  assert.equal(annotated.providers[0]?.workstreamLabel, 'Answer');
  assert.equal(annotated.providers[0]?.roleLabel, 'Answer Core');
  assert.ok(annotated.providers[0]?.reasons.includes('workstream_scoped'));
});

test('rankSubmissions orders by final score and assigns ranks', () => {
  const submissions: RankedSubmission[] = [
    {
      rank: 0,
      submission: {
        raidId: 'raid-1',
        providerId: 'provider-low',
        providerRunId: 'run-low',
        answerText: 'low score answer',
        explanation: 'low score answer',
        confidence: 0.5,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 0.4,
        testScore: 0.4,
        heuristicScore: 0.4,
        correctnessRubric: 0.4,
        sideEffectSafety: 0.4,
        explanationScore: 0.4,
        latencyScore: 0.4,
        uniquenessScore: 0.4,
        finalScore: 0.4,
        valid: true,
        invalidReasons: [],
      },
    },
    {
      rank: 0,
      submission: {
        raidId: 'raid-1',
        providerId: 'provider-high',
        providerRunId: 'run-high',
        answerText: 'high score answer with more detail',
        explanation: 'high score answer with more detail',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 0.9,
        testScore: 0.9,
        heuristicScore: 0.9,
        correctnessRubric: 0.9,
        sideEffectSafety: 0.9,
        explanationScore: 0.9,
        latencyScore: 0.9,
        uniquenessScore: 0.9,
        finalScore: 0.9,
        valid: true,
        invalidReasons: [],
      },
    },
  ];

  const ranked = rankSubmissions(submissions);

  assert.equal(ranked[0]?.submission.providerId, 'provider-high');
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.rank, 2);
});
