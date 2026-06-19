import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidRecord } from '@bossraid/shared-types';
import {
  buildActiveAssignmentCounts,
  getActiveAssignmentCount,
} from './orchestrator-provider-capacity.js';

function buildRaid(partial: Partial<RaidRecord> & Pick<RaidRecord, 'id' | 'status'>): RaidRecord {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadlineUnix: 0,
    task: {} as RaidRecord['task'],
    selectedProviders: [],
    reserveProviders: [],
    assignments: {},
    rankedSubmissions: [],
    reputationEvents: [],
    ...partial,
  };
}

test('buildActiveAssignmentCounts indexes active assignments once per discovery pass', () => {
  const raids = new Map<string, RaidRecord>([
    [
      'raid-1',
      buildRaid({
        id: 'raid-1',
        status: 'running',
        assignments: {
          'provider-a': {
            providerId: 'provider-a',
            status: 'running',
            invitedAt: new Date().toISOString(),
          },
        },
      }),
    ],
  ]);

  const counts = buildActiveAssignmentCounts({
    raids,
    launchReservations: new Map(),
  });

  assert.equal(
    getActiveAssignmentCount('provider-a', { raids, launchReservations: new Map() }, counts),
    1
  );
  assert.equal(
    getActiveAssignmentCount('provider-b', { raids, launchReservations: new Map() }, counts),
    0
  );
});
