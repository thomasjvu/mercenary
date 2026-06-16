import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMercenaryThread,
  deriveMercenaryThreadTitle,
  upsertMercenaryThread,
} from './mercenary-threads.js';

test('deriveMercenaryThreadTitle truncates long briefs', () => {
  const title = deriveMercenaryThreadTitle({
    raidBrief: 'Ship the marketplace base price columns before the next deploy window',
  });

  assert.ok(title.endsWith('…'));
  assert.ok(title.length <= 43);
});

test('upsertMercenaryThread inserts new threads and sorts by updatedAt', () => {
  const existing = createMercenaryThread({
    id: 'thread-a',
    title: 'Existing',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const next = upsertMercenaryThread(
    { activeThreadId: 'thread-a', threads: [existing] },
    createMercenaryThread({
      id: 'thread-b',
      title: 'Newest',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })
  );

  assert.equal(next.activeThreadId, 'thread-a');
  assert.equal(next.threads[0]?.id, 'thread-b');
  assert.equal(next.threads[1]?.id, 'thread-a');
});
