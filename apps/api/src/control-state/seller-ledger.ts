import { randomUUID } from 'node:crypto';
import { DEFAULTS } from '@bossraid/constants';
import { computeSellerPayout24hMetrics, SELLER_PAYOUT_STORE_LIMIT } from '../marketplace-stats.js';
import { ensurePublicAccountInSnapshot, readPublicAccount } from './sessions.js';
import type { ControlStateContext } from './state-context.js';
import type { PublicAccountEntry, SellerPayoutEntry } from './types.js';

export function linkSellerProvider(
  ctx: ControlStateContext,
  wallet: string,
  providerId: string,
  nowMs = Date.now()
): PublicAccountEntry {
  const normalizedWallet = wallet.toLowerCase();
  const { snapshot } = ctx.readPrunedState(nowMs);
  const account = ensurePublicAccountInSnapshot(snapshot, normalizedWallet);
  if (!account.sellerProviderIds.includes(providerId)) {
    account.sellerProviderIds.push(providerId);
    account.updatedAt = new Date(nowMs).toISOString();
  }
  ctx.writeState(snapshot);
  return structuredClone(account);
}

export function sellerOwnsProvider(
  ctx: ControlStateContext,
  wallet: string,
  providerId: string,
  nowMs = Date.now()
): boolean {
  const account = readPublicAccount(ctx, wallet, nowMs);
  return account?.sellerProviderIds.includes(providerId) ?? false;
}

/** Wallet that currently claims ownership of a registered seller provider id, if any. */
export function findSellerWalletForProvider(
  ctx: ControlStateContext,
  providerId: string,
  nowMs = Date.now()
): string | undefined {
  const { snapshot } = ctx.readPrunedState(nowMs);
  const match = snapshot.publicAccounts.find((account) =>
    account.sellerProviderIds.includes(providerId)
  );
  return match?.wallet;
}

export function recordSellerPayout(
  ctx: ControlStateContext,
  input: Omit<SellerPayoutEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): SellerPayoutEntry {
  const { snapshot } = ctx.readPrunedState(Date.now());
  const existing = snapshot.sellerPayouts.find(
    (entry) => entry.raidId === input.raidId && entry.providerId === input.providerId
  );
  if (existing) {
    return structuredClone(existing);
  }
  const entry: SellerPayoutEntry = {
    id: input.id ?? `payout_${randomUUID()}`,
    providerId: input.providerId,
    raidId: input.raidId,
    grossUsd: Math.max(0, input.grossUsd),
    status: input.status,
    txHash: input.txHash,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  snapshot.sellerPayouts.unshift(entry);
  snapshot.sellerPayouts = snapshot.sellerPayouts.slice(0, SELLER_PAYOUT_STORE_LIMIT);
  ctx.writeState(snapshot);
  return structuredClone(entry);
}

export function listSellerPayouts(
  ctx: ControlStateContext,
  providerIds: string[],
  limit = DEFAULTS.SELLER_PAYOUT_LIST_LIMIT,
  nowMs = Date.now()
): SellerPayoutEntry[] {
  const allowed = new Set(providerIds);
  const { snapshot, changed } = ctx.readPrunedState(nowMs);
  if (changed) {
    ctx.writeState(snapshot);
  }
  return snapshot.sellerPayouts
    .filter((entry) => allowed.has(entry.providerId))
    .slice(0, Math.max(1, limit))
    .map((entry) => structuredClone(entry));
}

function isAccruedPayout(entry: SellerPayoutEntry): boolean {
  if (entry.txHash || entry.flushedAt) {
    return false;
  }
  const status = entry.status.toLowerCase();
  return (
    status === 'accrued' || status === 'pending' || status === 'final' || status === 'complete'
  );
}

function isSettledPayout(entry: SellerPayoutEntry): boolean {
  if (entry.txHash || entry.flushedAt) {
    return true;
  }
  const status = entry.status.toLowerCase();
  return status === 'settled' || status === 'paid' || status === 'flushed';
}

export function getSellerStats(
  ctx: ControlStateContext,
  providerIds: string[],
  nowMs = Date.now(),
  flushMinUsd = 1
): {
  grossUsd: number;
  payoutCount: number;
  routedRequests24h: number;
  earnings24hUsd: number;
  /** Accrued ledger not yet on-chain (or batch-flushed). */
  pendingUsd: number;
  /** Settled / flushed on-chain (or file-mode settled). */
  settledUsd: number;
  /** True when pendingUsd >= flushMinUsd. */
  flushEligible: boolean;
  flushMinUsd: number;
  payouts: SellerPayoutEntry[];
} {
  const payouts = listSellerPayouts(ctx, providerIds, 500, nowMs);
  const metrics24h = computeSellerPayout24hMetrics(payouts, nowMs);
  const pendingUsd = payouts
    .filter((entry) => isAccruedPayout(entry))
    .reduce((sum, entry) => sum + entry.grossUsd, 0);
  const settledUsd = payouts
    .filter((entry) => isSettledPayout(entry))
    .reduce((sum, entry) => sum + entry.grossUsd, 0);
  return {
    grossUsd: payouts.reduce((sum, entry) => sum + entry.grossUsd, 0),
    payoutCount: payouts.length,
    routedRequests24h: metrics24h.routedRequests24h,
    earnings24hUsd: metrics24h.earnedBySellers24hUsd,
    pendingUsd,
    settledUsd,
    flushEligible: pendingUsd >= flushMinUsd,
    flushMinUsd,
    payouts,
  };
}

/**
 * Mark accrued seller payouts as settled (batch flush).
 * Used for file-mode Surplus parity and ops-triggered flush after treasury transfer.
 */
export function flushSellerPayouts(
  ctx: ControlStateContext,
  providerIds: string[],
  input: { txHash?: string; minUsd?: number } = {},
  nowMs = Date.now()
): { flushedCount: number; flushedUsd: number; payoutIds: string[] } {
  const allowed = new Set(providerIds);
  const minUsd = Math.max(0, input.minUsd ?? 1);
  const flushedIds: string[] = [];
  let flushedUsd = 0;
  const nowIso = new Date(nowMs).toISOString();

  ctx.mutateState((snapshot) => {
    const pending = snapshot.sellerPayouts.filter(
      (entry) => allowed.has(entry.providerId) && isAccruedPayout(entry)
    );
    const pendingSum = pending.reduce((sum, entry) => sum + entry.grossUsd, 0);
    if (pendingSum < minUsd) {
      return;
    }
    for (const entry of pending) {
      entry.status = 'settled';
      entry.flushedAt = nowIso;
      if (input.txHash) {
        entry.txHash = input.txHash;
      }
      flushedIds.push(entry.id);
      flushedUsd += entry.grossUsd;
    }
  }, nowMs);

  return {
    flushedCount: flushedIds.length,
    flushedUsd,
    payoutIds: flushedIds,
  };
}
