import assert from 'node:assert/strict';
import test from 'node:test';
import { createStorageBackend } from './storage-backend.js';

test('createStorageBackend routes memory and sqlite', () => {
  assert.equal(
    createStorageBackend(
      'memory',
      {
        memory: () => 'mem',
        sqlite: () => 'sql',
      },
      {}
    ),
    'mem'
  );
  assert.equal(
    createStorageBackend(
      'sqlite',
      {
        memory: () => 'mem',
        sqlite: (file) => `sql:${file}`,
      },
      { sqliteFile: '/tmp/state.sqlite' }
    ),
    'sql:/tmp/state.sqlite'
  );
});

test('createStorageBackend routes postgres when factory and url provided', () => {
  assert.equal(
    createStorageBackend(
      'postgres',
      {
        memory: () => 'mem',
        sqlite: () => 'sql',
        postgres: (url) => `pg:${url}`,
      },
      { databaseUrl: 'postgres://localhost/bossraid' }
    ),
    'pg:postgres://localhost/bossraid'
  );
});

test('createStorageBackend rejects postgres without url or factory', () => {
  assert.throws(
    () =>
      createStorageBackend(
        'postgres',
        {
          memory: () => 'mem',
          sqlite: () => 'sql',
          postgres: (url) => url,
        },
        {}
      ),
    /BOSSRAID_DATABASE_URL/
  );
  assert.throws(
    () =>
      createStorageBackend(
        'postgres',
        {
          memory: () => 'mem',
          sqlite: () => 'sql',
        },
        { databaseUrl: 'postgres://localhost/bossraid' }
      ),
    /not registered/
  );
});
