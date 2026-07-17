import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readDatabaseUrl, readStorageBackend } from '@bossraid/constants';
import { findWorkspaceRoot, resolveWorkspacePath } from '@bossraid/constants/workspace';
import { createSecretCipher, createStorageBackend, type SecretCipher } from '@bossraid/persistence';
import {
  API_CONTROL_STATE_SCHEMA_SQL,
  createPostgresPool,
  type PostgresPool,
} from '@bossraid/persistence-postgres';
import {
  createEmptyApiControlState,
  decryptApiControlStateSnapshot,
  encryptApiControlStateSnapshot,
  normalizeApiControlState,
} from './snapshot.js';
import type { ApiControlStateSnapshot, ApiControlStateStore } from './types.js';

const SNAPSHOT_KEY = 1;

export class ApiControlStateVersionConflictError extends Error {
  constructor() {
    super('API control state version conflict.');
    this.name = 'ApiControlStateVersionConflictError';
  }
}

function snapshotPersistRevision(snapshot: ApiControlStateSnapshot): string {
  const { savedAt: _savedAt, version: _version, ...rest } = snapshot;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

class InMemoryApiControlStateStore implements ApiControlStateStore {
  private snapshot = createEmptyApiControlState();
  private lastPersistedRevision?: string;

  loadState(): ApiControlStateSnapshot {
    return structuredClone(this.snapshot);
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    const revision = snapshotPersistRevision(snapshot);
    if (revision === this.lastPersistedRevision) {
      return;
    }
    snapshot.version += 1;
    snapshot.savedAt = new Date().toISOString();
    this.snapshot = structuredClone(snapshot);
    this.lastPersistedRevision = revision;
  }
}

class SqliteApiControlStateStore implements ApiControlStateStore {
  private db: DatabaseSync;
  private lastPersistedRevision?: string;

  constructor(
    path: string,
    private readonly cipher: SecretCipher
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      [
        'create table if not exists bossraid_api_control_state (',
        '  key integer primary key check(key = 1),',
        '  version integer not null,',
        '  saved_at text not null,',
        '  snapshot_json text not null',
        ')',
      ].join(' ')
    );
  }

  loadState(): ApiControlStateSnapshot {
    const row = this.db
      .prepare('select version, snapshot_json from bossraid_api_control_state where key = ?')
      .get(SNAPSHOT_KEY) as { version?: number; snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return createEmptyApiControlState();
    }

    const snapshot = normalizeApiControlState(
      decryptApiControlStateSnapshot(
        JSON.parse(row.snapshot_json) as Partial<ApiControlStateSnapshot>,
        this.cipher
      )
    );
    snapshot.version = row.version ?? snapshot.version;
    return snapshot;
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    const revision = snapshotPersistRevision(snapshot);
    if (revision === this.lastPersistedRevision) {
      return;
    }

    this.db.exec('begin immediate');

    try {
      const row = this.db
        .prepare('select version from bossraid_api_control_state where key = ?')
        .get(SNAPSHOT_KEY) as { version?: number } | undefined;
      const currentVersion = row?.version ?? 0;
      if (snapshot.version !== currentVersion) {
        throw new ApiControlStateVersionConflictError();
      }

      const nextVersion = currentVersion + 1;
      snapshot.version = nextVersion;
      snapshot.savedAt = new Date().toISOString();
      const encryptedJson = JSON.stringify(encryptApiControlStateSnapshot(snapshot, this.cipher));
      if (row) {
        const updated = this.db
          .prepare(
            [
              'update bossraid_api_control_state',
              'set version = ?, saved_at = ?, snapshot_json = ?',
              'where key = ? and version = ?',
            ].join(' ')
          )
          .run(nextVersion, snapshot.savedAt, encryptedJson, SNAPSHOT_KEY, currentVersion);
        if (updated.changes === 0) {
          throw new ApiControlStateVersionConflictError();
        }
      } else {
        this.db
          .prepare(
            'insert into bossraid_api_control_state (key, version, saved_at, snapshot_json) values (?, ?, ?, ?)'
          )
          .run(SNAPSHOT_KEY, nextVersion, snapshot.savedAt, encryptedJson);
      }
      this.lastPersistedRevision = revision;
      this.db.exec('commit');
    } catch (error) {
      this.db.exec('rollback');
      throw error;
    }
  }
}

/**
 * Postgres-backed control state with an in-memory working copy.
 * Call `await store.ready()` (or use createApiControlStateStoreAsync) before serving traffic.
 * Durable writes are serialized; designed for single API process (or sticky single-writer).
 * Multi-writer API replicas should not share this without a later async control-state refactor.
 */
export class PostgresApiControlStateStore implements ApiControlStateStore {
  private readonly pool: PostgresPool;
  private snapshot = createEmptyApiControlState();
  private lastPersistedRevision?: string;
  private writeChain: Promise<void> = Promise.resolve();
  private schemaReady?: Promise<void>;
  private loaded = false;

  constructor(
    databaseUrl: string,
    private readonly cipher: SecretCipher
  ) {
    this.pool = createPostgresPool(databaseUrl);
  }

  async ready(): Promise<void> {
    if (this.loaded) {
      return;
    }
    await this.ensureSchema();
    const result = await this.pool.query<{ version: number; snapshot_json: string }>(
      'select version, snapshot_json from bossraid_api_control_state where key = $1',
      [SNAPSHOT_KEY]
    );
    const row = result.rows[0];
    if (row?.snapshot_json) {
      const snapshot = normalizeApiControlState(
        decryptApiControlStateSnapshot(
          JSON.parse(row.snapshot_json) as Partial<ApiControlStateSnapshot>,
          this.cipher
        )
      );
      snapshot.version = row.version ?? snapshot.version;
      this.snapshot = snapshot;
      this.lastPersistedRevision = snapshotPersistRevision(snapshot);
    }
    this.loaded = true;
  }

  loadState(): ApiControlStateSnapshot {
    if (!this.loaded) {
      throw new Error(
        'PostgresApiControlStateStore not ready; await createApiControlStateStoreAsync() before use.'
      );
    }
    return structuredClone(this.snapshot);
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    if (!this.loaded) {
      throw new Error(
        'PostgresApiControlStateStore not ready; await createApiControlStateStoreAsync() before use.'
      );
    }
    const revision = snapshotPersistRevision(snapshot);
    if (revision === this.lastPersistedRevision) {
      return;
    }
    snapshot.version += 1;
    snapshot.savedAt = new Date().toISOString();
    this.snapshot = structuredClone(snapshot);
    this.lastPersistedRevision = snapshotPersistRevision(snapshot);
    const toPersist = structuredClone(snapshot);
    this.writeChain = this.writeChain
      .then(() => this.persistDurable(toPersist))
      .catch((error) => {
        // Keep chain alive; surface via process logging.
        console.error('[control-state] postgres durable write failed', error);
      });
  }

  private async persistDurable(snapshot: ApiControlStateSnapshot): Promise<void> {
    await this.ensureSchema();
    const encryptedJson = JSON.stringify(encryptApiControlStateSnapshot(snapshot, this.cipher));
    await this.pool.query(
      [
        'insert into bossraid_api_control_state (key, version, saved_at, snapshot_json)',
        'values ($1, $2, $3, $4)',
        'on conflict (key) do update set',
        '  version = excluded.version,',
        '  saved_at = excluded.saved_at,',
        '  snapshot_json = excluded.snapshot_json',
      ].join(' '),
      [SNAPSHOT_KEY, snapshot.version, snapshot.savedAt, encryptedJson]
    );
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool.query(API_CONTROL_STATE_SCHEMA_SQL).then(() => undefined);
    await this.schemaReady;
  }
}

export function createApiControlStateStore(env: NodeJS.ProcessEnv): ApiControlStateStore {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const storageBackend = readStorageBackend(env, {
    strict: true,
    isolateNonProcessEnv: true,
  });
  const cipher = createSecretCipher(env);
  const sqliteFile = resolveWorkspacePath(
    env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
    workspaceCwd
  );

  if (storageBackend === 'postgres') {
    throw new Error(
      'Use createApiControlStateStoreAsync() when BOSSRAID_STORAGE_BACKEND=postgres (requires await ready).'
    );
  }

  return createStorageBackend<ApiControlStateStore>(
    storageBackend,
    {
      memory: () => new InMemoryApiControlStateStore(),
      sqlite: (file) => new SqliteApiControlStateStore(file, cipher),
    },
    { sqliteFile }
  );
}

/** Async factory — required for postgres; works for all backends. */
export async function createApiControlStateStoreAsync(
  env: NodeJS.ProcessEnv
): Promise<ApiControlStateStore> {
  const storageBackend = readStorageBackend(env, {
    strict: true,
    isolateNonProcessEnv: true,
  });
  if (storageBackend !== 'postgres') {
    return createApiControlStateStore(env);
  }
  const databaseUrl = readDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error('BOSSRAID_DATABASE_URL is required when BOSSRAID_STORAGE_BACKEND=postgres.');
  }
  const cipher = createSecretCipher(env);
  const store = new PostgresApiControlStateStore(databaseUrl, cipher);
  await store.ready();
  return store;
}
