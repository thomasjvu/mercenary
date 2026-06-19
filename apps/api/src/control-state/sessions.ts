import { randomUUID } from 'node:crypto';
import type { ControlStateContext } from './state-context.js';
import type {
  ApiControlStateSnapshot,
  ApiOpsSessionEntry,
  ApiRuntimeSettings,
  PublicAccountEntry,
  PublicAuthNonceEntry,
  PublicSessionEntry,
} from './types.js';

export function ensurePublicAccountInSnapshot(
  snapshot: ApiControlStateSnapshot,
  wallet: string
): PublicAccountEntry {
  const normalizedWallet = wallet.toLowerCase();
  const existing = snapshot.publicAccounts.find((entry) => entry.wallet === normalizedWallet);
  if (existing) {
    if (typeof existing.balanceUsd !== 'number') {
      existing.balanceUsd = 0;
    }
    return existing;
  }
  const now = new Date().toISOString();
  const account: PublicAccountEntry = {
    wallet: normalizedWallet,
    createdAt: now,
    updatedAt: now,
    balanceUsd: 0,
    sellerProviderIds: [],
  };
  snapshot.publicAccounts.push(account);
  return account;
}

export function readOpsSession(
  ctx: ControlStateContext,
  token: string | undefined,
  nowMs = Date.now()
): ApiOpsSessionEntry | undefined {
  if (!token) {
    return undefined;
  }

  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  const session = snapshot.opsSessions.find((entry) => entry.token === token);
  if (changed) {
    ctx.writeState(snapshot);
  }
  if (!session || session.expiresAt <= nowMs) {
    return undefined;
  }
  return session;
}

export function issueOpsSession(
  ctx: ControlStateContext,
  ttlSec: number,
  nowMs = Date.now()
): ApiOpsSessionEntry {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const session: ApiOpsSessionEntry = {
    token: `ops_${randomUUID()}`,
    expiresAt: nowMs + ttlSec * 1_000,
  };
  snapshot.opsSessions.push(session);
  ctx.writeState(snapshot);
  return session;
}

export function clearOpsSession(
  ctx: ControlStateContext,
  token: string | undefined,
  nowMs = Date.now()
): void {
  if (!token) {
    return;
  }

  const { snapshot } = ctx.readPrunedState(nowMs);
  const nextSessions = snapshot.opsSessions.filter((entry) => entry.token !== token);
  if (nextSessions.length === snapshot.opsSessions.length) {
    return;
  }
  snapshot.opsSessions = nextSessions;
  ctx.writeState(snapshot);
}

export function createPublicAuthNonce(
  ctx: ControlStateContext,
  wallet: string | undefined,
  ttlSec: number,
  nowMs = Date.now()
): PublicAuthNonceEntry {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const nonce: PublicAuthNonceEntry = {
    nonce: `nonce_${randomUUID()}`,
    wallet: wallet?.toLowerCase(),
    expiresAt: nowMs + ttlSec * 1_000,
  };
  snapshot.publicAuthNonces.push(nonce);
  ctx.writeState(snapshot);
  return nonce;
}

export function consumePublicAuthNonce(
  ctx: ControlStateContext,
  nonce: string,
  wallet: string | undefined,
  nowMs = Date.now()
): PublicAuthNonceEntry | undefined {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const normalizedWallet = wallet?.toLowerCase();
  const entry = snapshot.publicAuthNonces.find((item) => {
    if (item.nonce !== nonce || item.expiresAt <= nowMs) {
      return false;
    }
    if (item.wallet) {
      return normalizedWallet != null && item.wallet === normalizedWallet;
    }
    return true;
  });
  if (!entry) {
    return undefined;
  }
  snapshot.publicAuthNonces = snapshot.publicAuthNonces.filter((item) => item.nonce !== nonce);
  ctx.writeState(snapshot);
  return entry;
}

export function issuePublicSession(
  ctx: ControlStateContext,
  wallet: string,
  ttlSec: number,
  nowMs = Date.now()
): PublicSessionEntry {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
  const session: PublicSessionEntry = {
    token: `sess_${randomUUID()}`,
    wallet: normalizedWallet,
    expiresAt: nowMs + ttlSec * 1_000,
  };
  snapshot.publicSessions.push(session);
  ctx.writeState(snapshot);
  return session;
}

export function readPublicSession(
  ctx: ControlStateContext,
  token: string | undefined,
  nowMs = Date.now()
): PublicSessionEntry | undefined {
  if (!token) {
    return undefined;
  }
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  const session = snapshot.publicSessions.find((entry) => entry.token === token);
  if (changed) {
    ctx.writeState(snapshot);
  }
  if (!session || session.expiresAt <= nowMs) {
    return undefined;
  }
  return session;
}

export function clearPublicSession(
  ctx: ControlStateContext,
  token: string | undefined,
  nowMs = Date.now()
): void {
  if (!token) {
    return;
  }
  const { snapshot } = ctx.readPrunedState(nowMs);
  const nextSessions = snapshot.publicSessions.filter((entry) => entry.token !== token);
  if (nextSessions.length === snapshot.publicSessions.length) {
    return;
  }
  snapshot.publicSessions = nextSessions;
  ctx.writeState(snapshot);
}

export function readPublicAccount(
  ctx: ControlStateContext,
  wallet: string,
  nowMs = Date.now()
): PublicAccountEntry | undefined {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  if (changed) {
    ctx.writeState(snapshot);
  }
  const account = snapshot.publicAccounts.find((entry) => entry.wallet === normalizedWallet);
  return account ? structuredClone(account) : undefined;
}

export function ensurePublicAccount(
  ctx: ControlStateContext,
  wallet: string,
  nowMs = Date.now()
): PublicAccountEntry {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
  ctx.writeState(snapshot);
  return structuredClone(account);
}

export function readRuntimeSettings(
  ctx: ControlStateContext,
  nowMs = Date.now()
): ApiRuntimeSettings {
  const { snapshot } = ctx.readPrunedState(nowMs);
  return structuredClone(snapshot.settings);
}

export function readX402Enabled(ctx: ControlStateContext, nowMs = Date.now()): boolean {
  const { snapshot } = ctx.readPrunedState(nowMs);
  return snapshot.settings.x402Enabled;
}

export function setX402Enabled(
  ctx: ControlStateContext,
  enabled: boolean,
  nowMs = Date.now()
): ApiRuntimeSettings {
  const { snapshot } = ctx.readPrunedState(nowMs);
  snapshot.settings = {
    x402Enabled: enabled,
    seeded: true,
  };
  ctx.writeState(snapshot);
  return structuredClone(snapshot.settings);
}

export function ensureRuntimeSettingsSeeded(
  ctx: ControlStateContext,
  env: NodeJS.ProcessEnv,
  nowMs = Date.now()
): ApiRuntimeSettings {
  const { snapshot } = ctx.readPrunedState(nowMs);
  if (snapshot.settings.seeded) {
    return structuredClone(snapshot.settings);
  }

  const x402Enabled =
    env.BOSSRAID_X402_ENABLED == null
      ? false
      : env.BOSSRAID_X402_ENABLED === 'true' ||
        env.BOSSRAID_X402_ENABLED === '1' ||
        env.BOSSRAID_X402_ENABLED === 'yes';
  snapshot.settings = {
    x402Enabled,
    seeded: true,
  };
  ctx.writeState(snapshot);
  return structuredClone(snapshot.settings);
}
