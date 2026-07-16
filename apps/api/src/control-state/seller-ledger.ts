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

/** All store rows for the given providers (no UI list cap). */
export function listAllSellerPayoutsForProviders(
  ctx: ControlStateContext,
  providerIds: string[],
  nowMs = Date.now()
): SellerPayoutEntry[] {
  return listSellerPayouts(ctx, providerIds, SELLER_PAYOUT_STORE_LIMIT, nowMs);
}

function isAccruedPayout(entry: SellerPayoutEntry): boolean {
  if (entry.txHash || entry.flushedAt) {
    return false;
  }
  const status = entry.status.toLowerCase();
  if (status === 'flushing') {
    return false;
  }
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
  // Full store for money amounts; UI list cap stays on the returned `payouts` slice.
  const allPayouts = listAllSellerPayoutsForProviders(ctx, providerIds, nowMs);
  const displayLimit = DEFAULTS.SELLER_PAYOUT_LIST_LIMIT;
  const payouts = allPayouts.slice(0, displayLimit);
  const metrics24h = computeSellerPayout24hMetrics(allPayouts, nowMs);
  const pendingUsd = allPayouts
    .filter((entry) => isAccruedPayout(entry))
    .reduce((sum, entry) => sum + entry.grossUsd, 0);
  const settledUsd = allPayouts
    .filter((entry) => isSettledPayout(entry))
    .reduce((sum, entry) => sum + entry.grossUsd, 0);
  return {
    grossUsd: allPayouts.reduce((sum, entry) => sum + entry.grossUsd, 0),
    payoutCount: allPayouts.length,
    routedRequests24h: metrics24h.routedRequests24h,
    earnings24hUsd: metrics24h.earnedBySellers24hUsd,
    pendingUsd,
    settledUsd,
    flushEligible: pendingUsd >= flushMinUsd,
    flushMinUsd,
    payouts,
  };
}

export type SellerFlushClaim = {
  claimId: string;
  claimedUsd: number;
  payoutIds: string[];
};

/**
 * Atomically mark all accrued rows for the providers as `flushing` for one claim.
 * Concurrent second claim sees no accrued rows and returns empty payoutIds.
 */
export function claimSellerPayoutsForFlush(
  ctx: ControlStateContext,
  providerIds: string[],
  input: { minUsd?: number } = {},
  nowMs = Date.now()
): SellerFlushClaim {
  const allowed = new Set(providerIds);
  const minUsd = Math.max(0, input.minUsd ?? 1);
  const claimId = `flushclaim_${randomUUID()}`;
  const payoutIds: string[] = [];
  let claimedUsd = 0;
  const nowIso = new Date(nowMs).toISOString();

  ctx.mutateState((snapshot) => {
    payoutIds.length = 0;
    claimedUsd = 0;
    const pending = snapshot.sellerPayouts.filter(
      (entry) => allowed.has(entry.providerId) && isAccruedPayout(entry)
    );
    const pendingSum = pending.reduce((sum, entry) => sum + entry.grossUsd, 0);
    if (pendingSum < minUsd) {
      return;
    }
    for (const entry of pending) {
      entry.status = 'flushing';
      entry.flushClaimId = claimId;
      entry.flushingAt = nowIso;
      payoutIds.push(entry.id);
      claimedUsd += entry.grossUsd;
    }
  }, nowMs);

  return {
    claimId,
    claimedUsd,
    payoutIds: [...payoutIds],
  };
}

/**
 * Mark rows still in `flushing` for this claim as settled after a successful transfer.
 */
export function settleSellerPayoutClaim(
  ctx: ControlStateContext,
  claim: { claimId: string; payoutIds: string[] },
  input: { txHash?: string } = {},
  nowMs = Date.now()
): { flushedCount: number; flushedUsd: number; payoutIds: string[] } {
  const idSet = new Set(claim.payoutIds);
  const flushedIds: string[] = [];
  let flushedUsd = 0;
  const nowIso = new Date(nowMs).toISOString();

  ctx.mutateState((snapshot) => {
    flushedIds.length = 0;
    flushedUsd = 0;
    for (const entry of snapshot.sellerPayouts) {
      if (!idSet.has(entry.id)) {
        continue;
      }
      if (entry.status.toLowerCase() !== 'flushing' || entry.flushClaimId !== claim.claimId) {
        continue;
      }
      entry.status = 'settled';
      entry.flushedAt = nowIso;
      if (input.txHash) {
        entry.txHash = input.txHash;
      }
      delete entry.flushClaimId;
      delete entry.flushingAt;
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

/**
 * Revert claimed rows back to accrued after a transfer failure (or aborted flush).
 */
export function releaseSellerPayoutClaim(
  ctx: ControlStateContext,
  claim: { claimId: string; payoutIds: string[] },
  nowMs = Date.now()
): { releasedCount: number } {
  const idSet = new Set(claim.payoutIds);
  let releasedCount = 0;

  ctx.mutateState((snapshot) => {
    releasedCount = 0;
    for (const entry of snapshot.sellerPayouts) {
      if (!idSet.has(entry.id)) {
        continue;
      }
      if (entry.status.toLowerCase() !== 'flushing' || entry.flushClaimId !== claim.claimId) {
        continue;
      }
      entry.status = 'accrued';
      delete entry.flushClaimId;
      delete entry.flushingAt;
      releasedCount += 1;
    }
  }, nowMs);

  return { releasedCount };
}

/**
 * Mark accrued seller payouts as settled (batch flush).
 * Claim-then-settle in one path so concurrent callers cannot double-settle.
 * Used for file-mode Surplus parity and ops-triggered flush after treasury transfer.
 */
export function flushSellerPayouts(
  ctx: ControlStateContext,
  providerIds: string[],
  input: { txHash?: string; minUsd?: number } = {},
  nowMs = Date.now()
): { flushedCount: number; flushedUsd: number; payoutIds: string[] } {
  const claim = claimSellerPayoutsForFlush(ctx, providerIds, { minUsd: input.minUsd }, nowMs);
  if (claim.payoutIds.length === 0) {
    return { flushedCount: 0, flushedUsd: 0, payoutIds: [] };
  }
  return settleSellerPayoutClaim(
    ctx,
    { claimId: claim.claimId, payoutIds: claim.payoutIds },
    { txHash: input.txHash },
    nowMs
  );
}
