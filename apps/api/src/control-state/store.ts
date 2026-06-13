import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readStorageBackend } from '@bossraid/constants';
import { findWorkspaceRoot, resolveWorkspacePath } from '@bossraid/constants/workspace';
import { createSecretCipher, createStorageBackend, type SecretCipher } from '@bossraid/persistence';
import {
  createEmptyApiControlState,
  decryptApiControlStateSnapshot,
  encryptApiControlStateSnapshot,
  normalizeApiControlState,
} from './snapshot.js';
import type { ApiControlStateSnapshot, ApiControlStateStore } from './types.js';

const SNAPSHOT_KEY = 1;

class InMemoryApiControlStateStore implements ApiControlStateStore {
  private snapshot = createEmptyApiControlState();

  loadState(): ApiControlStateSnapshot {
    return structuredClone(this.snapshot);
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    this.snapshot = structuredClone(snapshot);
  }
}

class SqliteApiControlStateStore implements ApiControlStateStore {
  private db: DatabaseSync;

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
      .prepare('select snapshot_json from bossraid_api_control_state where key = ?')
      .get(SNAPSHOT_KEY) as { snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return createEmptyApiControlState();
    }

    return normalizeApiControlState(
      decryptApiControlStateSnapshot(
        JSON.parse(row.snapshot_json) as Partial<ApiControlStateSnapshot>,
        this.cipher
      )
    );
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    this.db.exec('begin immediate');

    try {
      this.db
        .prepare(
          [
            'insert into bossraid_api_control_state (key, version, saved_at, snapshot_json)',
            'values (?, ?, ?, ?)',
            'on conflict(key) do update set',
            '  version = excluded.version,',
            '  saved_at = excluded.saved_at,',
            '  snapshot_json = excluded.snapshot_json',
          ].join(' ')
        )
        .run(
          SNAPSHOT_KEY,
          snapshot.version,
          snapshot.savedAt,
          JSON.stringify(encryptApiControlStateSnapshot(snapshot, this.cipher))
        );
      this.db.exec('commit');
    } catch (error) {
      this.db.exec('rollback');
      throw error;
    }
  }
}

export function createApiControlStateStore(env: NodeJS.ProcessEnv): ApiControlStateStore {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const storageBackend = readStorageBackend(env, {
    strict: true,
    isolateNonProcessEnv: true,
  });
  const cipher = createSecretCipher(env);

  return createStorageBackend<ApiControlStateStore>(
    storageBackend,
    {
      memory: () => new InMemoryApiControlStateStore(),
      sqlite: (sqliteFile) => new SqliteApiControlStateStore(sqliteFile, cipher),
    },
    {
      sqliteFile: resolveWorkspacePath(
        env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
        workspaceCwd
      ),
    }
  );
}
