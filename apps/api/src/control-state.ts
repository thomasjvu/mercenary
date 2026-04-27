import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type StorageBackend = "sqlite" | "file" | "memory";

type ApiOpsSessionEntry = {
  token: string;
  expiresAt: number;
};

type ApiRateLimitEntry = {
  key: string;
  count: number;
  resetAt: number;
};

type ApiControlStateSnapshot = {
  version: 1;
  savedAt: string;
  opsSessions: ApiOpsSessionEntry[];
  rateLimits: ApiRateLimitEntry[];
};

const SNAPSHOT_KEY = 1;

interface ApiControlStateStore {
  loadState(): ApiControlStateSnapshot;
  saveState(snapshot: ApiControlStateSnapshot): void;
}

class InMemoryApiControlStateStore implements ApiControlStateStore {
  private snapshot = createEmptyApiControlState();

  loadState(): ApiControlStateSnapshot {
    return structuredClone(this.snapshot);
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    this.snapshot = structuredClone(snapshot);
  }
}

class FileApiControlStateStore implements ApiControlStateStore {
  constructor(private readonly path: string) {}

  loadState(): ApiControlStateSnapshot {
    try {
      const raw = readFileSync(this.path, "utf8");
      return normalizeApiControlState(JSON.parse(raw) as Partial<ApiControlStateSnapshot>);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyApiControlState();
      }
      throw error;
    }
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
    renameSync(tempPath, this.path);
  }
}

class SqliteApiControlStateStore implements ApiControlStateStore {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      [
        "create table if not exists bossraid_api_control_state (",
        "  key integer primary key check(key = 1),",
        "  version integer not null,",
        "  saved_at text not null,",
        "  snapshot_json text not null",
        ")",
      ].join(" "),
    );
  }

  loadState(): ApiControlStateSnapshot {
    const row = this.db
      .prepare("select snapshot_json from bossraid_api_control_state where key = ?")
      .get(SNAPSHOT_KEY) as { snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return createEmptyApiControlState();
    }

    return normalizeApiControlState(JSON.parse(row.snapshot_json) as Partial<ApiControlStateSnapshot>);
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    this.db.exec("begin immediate");

    try {
      this.db.prepare(
        [
          "insert into bossraid_api_control_state (key, version, saved_at, snapshot_json)",
          "values (?, ?, ?, ?)",
          "on conflict(key) do update set",
          "  version = excluded.version,",
          "  saved_at = excluded.saved_at,",
          "  snapshot_json = excluded.snapshot_json",
        ].join(" "),
      ).run(
        SNAPSHOT_KEY,
        snapshot.version,
        snapshot.savedAt,
        JSON.stringify(snapshot),
      );
      this.db.exec("commit");
    } catch (error) {
      this.db.exec("rollback");
      throw error;
    }
  }
}

function createEmptyApiControlState(): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    opsSessions: [],
    rateLimits: [],
  };
}

function normalizeApiControlState(
  snapshot: Partial<ApiControlStateSnapshot> | undefined,
): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt:
      typeof snapshot?.savedAt === "string" && snapshot.savedAt.length > 0
        ? snapshot.savedAt
        : new Date().toISOString(),
    opsSessions: Array.isArray(snapshot?.opsSessions)
      ? snapshot.opsSessions.filter(isValidOpsSessionEntry)
      : [],
    rateLimits: Array.isArray(snapshot?.rateLimits)
      ? snapshot.rateLimits.filter(isValidRateLimitEntry)
      : [],
  };
}

function isValidOpsSessionEntry(value: unknown): value is ApiOpsSessionEntry {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as ApiOpsSessionEntry).token === "string" &&
    typeof (value as ApiOpsSessionEntry).expiresAt === "number" &&
    Number.isFinite((value as ApiOpsSessionEntry).expiresAt)
  );
}

function isValidRateLimitEntry(value: unknown): value is ApiRateLimitEntry {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as ApiRateLimitEntry).key === "string" &&
    typeof (value as ApiRateLimitEntry).count === "number" &&
    Number.isFinite((value as ApiRateLimitEntry).count) &&
    typeof (value as ApiRateLimitEntry).resetAt === "number" &&
    Number.isFinite((value as ApiRateLimitEntry).resetAt)
  );
}

function readStorageBackend(env: NodeJS.ProcessEnv): StorageBackend {
  const configured = env.BOSSRAID_STORAGE_BACKEND;
  if (configured === "sqlite" || configured === "file" || configured === "memory") {
    return configured;
  }

  if (configured != null) {
    throw new Error("BOSSRAID_STORAGE_BACKEND must be sqlite, file, or memory.");
  }

  if (env !== process.env) {
    return "memory";
  }

  return env.BOSSRAID_STATE_FILE ? "file" : "sqlite";
}

function findWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

function resolveWorkspacePath(pathValue: string | undefined, workspaceCwd: string): string | undefined {
  if (!pathValue) {
    return undefined;
  }

  if (isAbsolute(pathValue)) {
    return pathValue;
  }

  return resolve(workspaceCwd, pathValue);
}

function deriveApiStateFile(path: string): string {
  const extension = extname(path);
  if (extension.length > 0) {
    return `${path.slice(0, -extension.length)}.api${extension}`;
  }

  return `${path}.api.json`;
}

function createApiControlStateStore(env: NodeJS.ProcessEnv): ApiControlStateStore {
  const workspaceCwd = findWorkspaceRoot(process.env.INIT_CWD ?? process.cwd());
  const storageBackend = readStorageBackend(env);

  switch (storageBackend) {
    case "memory":
      return new InMemoryApiControlStateStore();
    case "file": {
      const stateFile = resolveWorkspacePath(env.BOSSRAID_STATE_FILE, workspaceCwd);
      if (!stateFile) {
        throw new Error("BOSSRAID_STATE_FILE is required when BOSSRAID_STORAGE_BACKEND=file.");
      }
      return new FileApiControlStateStore(deriveApiStateFile(stateFile));
    }
    case "sqlite": {
      const sqliteFile = resolveWorkspacePath(
        env.BOSSRAID_SQLITE_FILE ?? "./temp/bossraid-state.sqlite",
        workspaceCwd,
      );
      if (!sqliteFile) {
        throw new Error("BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.");
      }
      return new SqliteApiControlStateStore(sqliteFile);
    }
  }
}

export class ApiControlState {
  constructor(private readonly store: ApiControlStateStore) {}

  readOpsSession(token: string | undefined, nowMs = Date.now()): ApiOpsSessionEntry | undefined {
    if (!token) {
      return undefined;
    }

    const { snapshot, changed } = this.readPrunedState(nowMs);
    const session = snapshot.opsSessions.find((entry) => entry.token === token);
    if (changed) {
      this.writeState(snapshot);
    }
    if (!session || session.expiresAt <= nowMs) {
      return undefined;
    }
    return session;
  }

  issueOpsSession(ttlSec: number, nowMs = Date.now()): ApiOpsSessionEntry {
    const { snapshot } = this.readPrunedState(nowMs);
    const session: ApiOpsSessionEntry = {
      token: `ops_${randomUUID()}`,
      expiresAt: nowMs + ttlSec * 1_000,
    };
    snapshot.opsSessions.push(session);
    this.writeState(snapshot);
    return session;
  }

  clearOpsSession(token: string | undefined, nowMs = Date.now()): void {
    if (!token) {
      return;
    }

    const { snapshot } = this.readPrunedState(nowMs);
    const nextSessions = snapshot.opsSessions.filter((entry) => entry.token !== token);
    if (nextSessions.length === snapshot.opsSessions.length) {
      return;
    }
    snapshot.opsSessions = nextSessions;
    this.writeState(snapshot);
  }

  consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now(),
  ): { allowed: true } | { allowed: false; retryAfterSec: number } {
    const { snapshot, changed } = this.readPrunedState(nowMs);
    const entryKey = `${bucket}:${key}`;
    const current = snapshot.rateLimits.find((entry) => entry.key === entryKey);

    if (!current || current.resetAt <= nowMs) {
      const nextEntry: ApiRateLimitEntry = {
        key: entryKey,
        count: 1,
        resetAt: nowMs + windowMs,
      };
      snapshot.rateLimits = snapshot.rateLimits
        .filter((entry) => entry.key !== entryKey)
        .concat(nextEntry);
      this.writeState(snapshot);
      return { allowed: true };
    }

    if (current.count >= maxRequests) {
      if (changed) {
        this.writeState(snapshot);
      }
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000)),
      };
    }

    current.count += 1;
    this.writeState(snapshot);
    return { allowed: true };
  }

  private readPrunedState(nowMs: number): { snapshot: ApiControlStateSnapshot; changed: boolean } {
    const snapshot = this.store.loadState();
    const nextSessions = snapshot.opsSessions.filter((entry) => entry.expiresAt > nowMs);
    const nextRateLimits = snapshot.rateLimits.filter((entry) => entry.resetAt > nowMs);
    const changed =
      nextSessions.length !== snapshot.opsSessions.length ||
      nextRateLimits.length !== snapshot.rateLimits.length;

    if (!changed) {
      return { snapshot, changed: false };
    }

    snapshot.opsSessions = nextSessions;
    snapshot.rateLimits = nextRateLimits;
    return { snapshot, changed: true };
  }

  private writeState(snapshot: ApiControlStateSnapshot): void {
    snapshot.savedAt = new Date().toISOString();
    this.store.saveState(snapshot);
  }
}

export function createApiControlState(env: NodeJS.ProcessEnv = process.env): ApiControlState {
  return new ApiControlState(createApiControlStateStore(env));
}