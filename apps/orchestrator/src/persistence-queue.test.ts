import assert from 'node:assert/strict';
import test from 'node:test';
import { PersistenceQueue, PersistenceUnavailableError } from './persistence-queue.js';

test('PersistenceQueue serializes persistence tasks', async () => {
  const queue = new PersistenceQueue();
  const order: number[] = [];

  const first = queue.enqueue(async () => {
    order.push(1);
  });
  const second = queue.enqueue(async () => {
    order.push(2);
  });

  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
});

test('PersistenceQueue records the latest persistence failure', async () => {
  const queue = new PersistenceQueue();

  await assert.rejects(
    queue.enqueue(async () => {
      throw new Error('disk full');
    }),
    /disk full/
  );

  assert.throws(() => queue.assertWritable(), PersistenceUnavailableError);
  assert.match(queue.lastPersistenceError?.message ?? '', /disk full/);
});

test('PersistenceQueue exposes health for readiness gates', async () => {
  const queue = new PersistenceQueue();

  assert.deepEqual(queue.getHealth(), { healthy: true });

  await assert.rejects(
    queue.enqueue(async () => {
      throw new Error('disk full');
    }),
    /disk full/
  );

  assert.deepEqual(queue.getHealth(), {
    healthy: false,
    lastError: 'disk full',
  });
});

test('PersistenceQueue clears the last error after a successful write', async () => {
  const queue = new PersistenceQueue();

  await assert.rejects(
    queue.enqueue(async () => {
      throw new Error('temporary outage');
    }),
    /temporary outage/
  );

  await queue.enqueue(async () => undefined);

  queue.assertWritable();
  assert.equal(queue.lastPersistenceError, undefined);
});
