import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSecretCipher, type SecretCipher } from '@bossraid/persistence';

type StorageBackend = 'sqlite' | 'file' | 'memory';

type ApiOpsSessionEntry = {
  token: string;
  expiresAt: number;
};

type ApiRateLimitEntry = {
  key: string;
  count: number;
  resetAt: number;
};

export type PublicAuthNonceEntry = {
  nonce: string;
  wallet?: string;
  expiresAt: number;
};

export type PublicSessionEntry = {
  token: string;
  wallet: string;
  expiresAt: number;
};

export type PublicAccountEntry = {
  wallet: string;
  createdAt: string;
  updatedAt: string;
  sellerProviderIds: string[];
};

export type BuyerApiKeyEntry = {
  id: string;
  wallet: string;
  name: string;
  keyHash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
  status: 'active' | 'revoked';
};

type ApiControlStateSnapshot = {
  version: 1;
  savedAt: string;
  opsSessions: ApiOpsSessionEntry[];
  publicAuthNonces: PublicAuthNonceEntry[];
  publicSessions: PublicSessionEntry[];
  publicAccounts: PublicAccountEntry[];
  buyerApiKeys: BuyerApiKeyEntry[];
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
  constructor(
    private readonly path: string,
    private readonly cipher: SecretCipher
  ) {}

  loadState(): ApiControlStateSnapshot {
    try {
      const raw = readFileSync(this.path, 'utf8');
      return normalizeApiControlState(
        decryptApiControlStateSnapshot(
          JSON.parse(raw) as Partial<ApiControlStateSnapshot>,
          this.cipher
        )
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createEmptyApiControlState();
      }
      throw error;
    }
  }

  saveState(snapshot: ApiControlStateSnapshot): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(
      tempPath,
      JSON.stringify(encryptApiControlStateSnapshot(snapshot, this.cipher), null, 2),
      'utf8'
    );
    renameSync(tempPath, this.path);
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

function createEmptyApiControlState(): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    opsSessions: [],
    publicAuthNonces: [],
    publicSessions: [],
    publicAccounts: [],
    buyerApiKeys: [],
    rateLimits: [],
  };
}

function normalizeApiControlState(
  snapshot: Partial<ApiControlStateSnapshot> | undefined
): ApiControlStateSnapshot {
  return {
    version: 1,
    savedAt:
      typeof snapshot?.savedAt === 'string' && snapshot.savedAt.length > 0
        ? snapshot.savedAt
        : new Date().toISOString(),
    opsSessions: Array.isArray(snapshot?.opsSessions)
      ? snapshot.opsSessions.filter(isValidOpsSessionEntry)
      : [],
    publicAuthNonces: Array.isArray(snapshot?.publicAuthNonces)
      ? snapshot.publicAuthNonces.filter(isValidPublicAuthNonceEntry)
      : [],
    publicSessions: Array.isArray(snapshot?.publicSessions)
      ? snapshot.publicSessions.filter(isValidPublicSessionEntry)
      : [],
    publicAccounts: Array.isArray(snapshot?.publicAccounts)
      ? snapshot.publicAccounts.filter(isValidPublicAccountEntry)
      : [],
    buyerApiKeys: Array.isArray(snapshot?.buyerApiKeys)
      ? snapshot.buyerApiKeys.filter(isValidBuyerApiKeyEntry)
      : [],
    rateLimits: Array.isArray(snapshot?.rateLimits)
      ? snapshot.rateLimits.filter(isValidRateLimitEntry)
      : [],
  };
}

function encryptApiControlStateSnapshot(
  snapshot: ApiControlStateSnapshot,
  cipher: SecretCipher
): ApiControlStateSnapshot {
  if (!cipher.enabled) {
    return snapshot;
  }

  return {
    ...snapshot,
    opsSessions: snapshot.opsSessions.map((session) => ({
      ...session,
      token: cipher.encrypt(session.token),
    })),
    publicAuthNonces: snapshot.publicAuthNonces.map((nonce) => ({
      ...nonce,
      nonce: cipher.encrypt(nonce.nonce),
    })),
    publicSessions: snapshot.publicSessions.map((session) => ({
      ...session,
      token: cipher.encrypt(session.token),
    })),
    buyerApiKeys: snapshot.buyerApiKeys.map((key) => ({
      ...key,
      keyHash: cipher.encrypt(key.keyHash),
    })),
  };
}

function decryptApiControlStateSnapshot(
  snapshot: Partial<ApiControlStateSnapshot> | undefined,
  cipher: SecretCipher
): Partial<ApiControlStateSnapshot> | undefined {
  if (!snapshot) {
    return snapshot;
  }

  return {
    ...snapshot,
    opsSessions: Array.isArray(snapshot.opsSessions)
      ? snapshot.opsSessions.map((session) => ({
          ...session,
          token: typeof session.token === 'string' ? cipher.decrypt(session.token) : session.token,
        }))
      : snapshot.opsSessions,
    publicAuthNonces: Array.isArray(snapshot.publicAuthNonces)
      ? snapshot.publicAuthNonces.map((nonce) => ({
          ...nonce,
          nonce: typeof nonce.nonce === 'string' ? cipher.decrypt(nonce.nonce) : nonce.nonce,
        }))
      : snapshot.publicAuthNonces,
    publicSessions: Array.isArray(snapshot.publicSessions)
      ? snapshot.publicSessions.map((session) => ({
          ...session,
          token: typeof session.token === 'string' ? cipher.decrypt(session.token) : session.token,
        }))
      : snapshot.publicSessions,
    buyerApiKeys: Array.isArray(snapshot.buyerApiKeys)
      ? snapshot.buyerApiKeys.map((key) => ({
          ...key,
          keyHash: typeof key.keyHash === 'string' ? cipher.decrypt(key.keyHash) : key.keyHash,
        }))
      : snapshot.buyerApiKeys,
  };
}

function isValidOpsSessionEntry(value: unknown): value is ApiOpsSessionEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ApiOpsSessionEntry).token === 'string' &&
    typeof (value as ApiOpsSessionEntry).expiresAt === 'number' &&
    Number.isFinite((value as ApiOpsSessionEntry).expiresAt)
  );
}

function isValidRateLimitEntry(value: unknown): value is ApiRateLimitEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ApiRateLimitEntry).key === 'string' &&
    typeof (value as ApiRateLimitEntry).count === 'number' &&
    Number.isFinite((value as ApiRateLimitEntry).count) &&
    typeof (value as ApiRateLimitEntry).resetAt === 'number' &&
    Number.isFinite((value as ApiRateLimitEntry).resetAt)
  );
}

function isValidPublicAuthNonceEntry(value: unknown): value is PublicAuthNonceEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicAuthNonceEntry).nonce === 'string' &&
    typeof (value as PublicAuthNonceEntry).expiresAt === 'number' &&
    Number.isFinite((value as PublicAuthNonceEntry).expiresAt)
  );
}

function isValidPublicSessionEntry(value: unknown): value is PublicSessionEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicSessionEntry).token === 'string' &&
    typeof (value as PublicSessionEntry).wallet === 'string' &&
    typeof (value as PublicSessionEntry).expiresAt === 'number' &&
    Number.isFinite((value as PublicSessionEntry).expiresAt)
  );
}

function isValidPublicAccountEntry(value: unknown): value is PublicAccountEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as PublicAccountEntry).wallet === 'string' &&
    typeof (value as PublicAccountEntry).createdAt === 'string' &&
    typeof (value as PublicAccountEntry).updatedAt === 'string' &&
    Array.isArray((value as PublicAccountEntry).sellerProviderIds)
  );
}

function isValidBuyerApiKeyEntry(value: unknown): value is BuyerApiKeyEntry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as BuyerApiKeyEntry).id === 'string' &&
    typeof (value as BuyerApiKeyEntry).wallet === 'string' &&
    typeof (value as BuyerApiKeyEntry).name === 'string' &&
    typeof (value as BuyerApiKeyEntry).keyHash === 'string' &&
    typeof (value as BuyerApiKeyEntry).prefix === 'string' &&
    typeof (value as BuyerApiKeyEntry).createdAt === 'string' &&
    typeof (value as BuyerApiKeyEntry).spentUsd === 'number' &&
    ((value as BuyerApiKeyEntry).status === 'active' ||
      (value as BuyerApiKeyEntry).status === 'revoked')
  );
}

function readStorageBackend(env: NodeJS.ProcessEnv): StorageBackend {
  const configured = env.BOSSRAID_STORAGE_BACKEND;
  if (configured === 'sqlite' || configured === 'file' || configured === 'memory') {
    return configured;
  }

  if (configured != null) {
    throw new Error('BOSSRAID_STORAGE_BACKEND must be sqlite, file, or memory.');
  }

  if (env !== process.env) {
    return 'memory';
  }

  return env.BOSSRAID_STATE_FILE ? 'file' : 'sqlite';
}

function findWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (existsSync(resolve(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

function resolveWorkspacePath(
  pathValue: string | undefined,
  workspaceCwd: string
): string | undefined {
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
  const cipher = createSecretCipher(env);

  switch (storageBackend) {
    case 'memory':
      return new InMemoryApiControlStateStore();
    case 'file': {
      const stateFile = resolveWorkspacePath(env.BOSSRAID_STATE_FILE, workspaceCwd);
      if (!stateFile) {
        throw new Error('BOSSRAID_STATE_FILE is required when BOSSRAID_STORAGE_BACKEND=file.');
      }
      return new FileApiControlStateStore(deriveApiStateFile(stateFile), cipher);
    }
    case 'sqlite': {
      const sqliteFile = resolveWorkspacePath(
        env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
        workspaceCwd
      );
      if (!sqliteFile) {
        throw new Error('BOSSRAID_SQLITE_FILE is required when BOSSRAID_STORAGE_BACKEND=sqlite.');
      }
      return new SqliteApiControlStateStore(sqliteFile, cipher);
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

  createPublicAuthNonce(
    wallet: string | undefined,
    ttlSec: number,
    nowMs = Date.now()
  ): PublicAuthNonceEntry {
    const { snapshot } = this.readPrunedState(nowMs);
    const nonce: PublicAuthNonceEntry = {
      nonce: `nonce_${randomUUID()}`,
      wallet: wallet?.toLowerCase(),
      expiresAt: nowMs + ttlSec * 1_000,
    };
    snapshot.publicAuthNonces.push(nonce);
    this.writeState(snapshot);
    return nonce;
  }

  consumePublicAuthNonce(
    nonce: string,
    wallet: string | undefined,
    nowMs = Date.now()
  ): PublicAuthNonceEntry | undefined {
    const { snapshot } = this.readPrunedState(nowMs);
    const normalizedWallet = wallet?.toLowerCase();
    const entry = snapshot.publicAuthNonces.find(
      (item) =>
        item.nonce === nonce &&
        item.expiresAt > nowMs &&
        (!item.wallet || !normalizedWallet || item.wallet === normalizedWallet)
    );
    if (!entry) {
      return undefined;
    }
    snapshot.publicAuthNonces = snapshot.publicAuthNonces.filter((item) => item.nonce !== nonce);
    this.writeState(snapshot);
    return entry;
  }

  issuePublicSession(wallet: string, ttlSec: number, nowMs = Date.now()): PublicSessionEntry {
    const normalizedWallet = wallet.toLowerCase();
    const { snapshot } = this.readPrunedState(nowMs);
    this.ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
    const session: PublicSessionEntry = {
      token: `sess_${randomUUID()}`,
      wallet: normalizedWallet,
      expiresAt: nowMs + ttlSec * 1_000,
    };
    snapshot.publicSessions.push(session);
    this.writeState(snapshot);
    return session;
  }

  readPublicSession(token: string | undefined, nowMs = Date.now()): PublicSessionEntry | undefined {
    if (!token) {
      return undefined;
    }
    const { snapshot, changed } = this.readPrunedState(nowMs);
    const session = snapshot.publicSessions.find((entry) => entry.token === token);
    if (changed) {
      this.writeState(snapshot);
    }
    if (!session || session.expiresAt <= nowMs) {
      return undefined;
    }
    return session;
  }

  clearPublicSession(token: string | undefined, nowMs = Date.now()): void {
    if (!token) {
      return;
    }
    const { snapshot } = this.readPrunedState(nowMs);
    const nextSessions = snapshot.publicSessions.filter((entry) => entry.token !== token);
    if (nextSessions.length === snapshot.publicSessions.length) {
      return;
    }
    snapshot.publicSessions = nextSessions;
    this.writeState(snapshot);
  }

  readPublicAccount(wallet: string, nowMs = Date.now()): PublicAccountEntry {
    const normalizedWallet = wallet.toLowerCase();
    const { snapshot } = this.readPrunedState(nowMs);
    const account = this.ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
    this.writeState(snapshot);
    return structuredClone(account);
  }

  listBuyerApiKeys(wallet: string, nowMs = Date.now()): BuyerApiKeyEntry[] {
    const normalizedWallet = wallet.toLowerCase();
    const { snapshot, changed } = this.readPrunedState(nowMs);
    if (changed) {
      this.writeState(snapshot);
    }
    return snapshot.buyerApiKeys
      .filter((key) => key.wallet === normalizedWallet)
      .map((key) => structuredClone(key));
  }

  createBuyerApiKey(input: {
    wallet: string;
    name: string;
    keyHash: string;
    prefix: string;
    spendLimitUsd?: number;
  }): BuyerApiKeyEntry {
    const { snapshot } = this.readPrunedState(Date.now());
    const wallet = input.wallet.toLowerCase();
    this.ensurePublicAccountInSnapshot(snapshot, wallet);
    const now = new Date().toISOString();
    const key: BuyerApiKeyEntry = {
      id: `key_${randomUUID()}`,
      wallet,
      name: input.name,
      keyHash: input.keyHash,
      prefix: input.prefix,
      createdAt: now,
      spendLimitUsd: input.spendLimitUsd,
      spentUsd: 0,
      status: 'active',
    };
    snapshot.buyerApiKeys.push(key);
    this.writeState(snapshot);
    return structuredClone(key);
  }

  revokeBuyerApiKey(wallet: string, keyId: string, nowMs = Date.now()): boolean {
    const normalizedWallet = wallet.toLowerCase();
    const { snapshot } = this.readPrunedState(nowMs);
    const key = snapshot.buyerApiKeys.find(
      (item) => item.wallet === normalizedWallet && item.id === keyId
    );
    if (!key) {
      return false;
    }
    key.status = 'revoked';
    this.writeState(snapshot);
    return true;
  }

  readActiveBuyerApiKeyByHash(keyHash: string, nowMs = Date.now()): BuyerApiKeyEntry | undefined {
    const { snapshot, changed } = this.readPrunedState(nowMs);
    const key = snapshot.buyerApiKeys.find(
      (item) => item.keyHash === keyHash && item.status === 'active'
    );
    if (changed) {
      this.writeState(snapshot);
    }
    return key ? structuredClone(key) : undefined;
  }

  recordBuyerApiKeyUsage(keyId: string, costUsd: number, nowMs = Date.now()): void {
    const { snapshot } = this.readPrunedState(nowMs);
    const key = snapshot.buyerApiKeys.find((item) => item.id === keyId);
    if (!key) {
      return;
    }
    key.spentUsd += Math.max(0, costUsd);
    key.lastUsedAt = new Date(nowMs).toISOString();
    this.writeState(snapshot);
  }

  linkSellerProvider(wallet: string, providerId: string, nowMs = Date.now()): PublicAccountEntry {
    const normalizedWallet = wallet.toLowerCase();
    const { snapshot } = this.readPrunedState(nowMs);
    const account = this.ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
    if (!account.sellerProviderIds.includes(providerId)) {
      account.sellerProviderIds.push(providerId);
      account.updatedAt = new Date(nowMs).toISOString();
    }
    this.writeState(snapshot);
    return structuredClone(account);
  }

  sellerOwnsProvider(wallet: string, providerId: string, nowMs = Date.now()): boolean {
    const account = this.readPublicAccount(wallet, nowMs);
    return account.sellerProviderIds.includes(providerId);
  }

  consumeRateLimit(
    bucket: string,
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now()
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
    const nextPublicAuthNonces = snapshot.publicAuthNonces.filter(
      (entry) => entry.expiresAt > nowMs
    );
    const nextPublicSessions = snapshot.publicSessions.filter((entry) => entry.expiresAt > nowMs);
    const nextRateLimits = snapshot.rateLimits.filter((entry) => entry.resetAt > nowMs);
    const changed =
      nextSessions.length !== snapshot.opsSessions.length ||
      nextPublicAuthNonces.length !== snapshot.publicAuthNonces.length ||
      nextPublicSessions.length !== snapshot.publicSessions.length ||
      nextRateLimits.length !== snapshot.rateLimits.length;

    if (!changed) {
      return { snapshot, changed: false };
    }

    snapshot.opsSessions = nextSessions;
    snapshot.publicAuthNonces = nextPublicAuthNonces;
    snapshot.publicSessions = nextPublicSessions;
    snapshot.rateLimits = nextRateLimits;
    return { snapshot, changed: true };
  }

  private ensurePublicAccountInSnapshot(
    snapshot: ApiControlStateSnapshot,
    wallet: string
  ): PublicAccountEntry {
    const normalizedWallet = wallet.toLowerCase();
    const existing = snapshot.publicAccounts.find((entry) => entry.wallet === normalizedWallet);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const account: PublicAccountEntry = {
      wallet: normalizedWallet,
      createdAt: now,
      updatedAt: now,
      sellerProviderIds: [],
    };
    snapshot.publicAccounts.push(account);
    return account;
  }

  private writeState(snapshot: ApiControlStateSnapshot): void {
    snapshot.savedAt = new Date().toISOString();
    this.store.saveState(snapshot);
  }
}

export function createApiControlState(env: NodeJS.ProcessEnv = process.env): ApiControlState {
  return new ApiControlState(createApiControlStateStore(env));
}
