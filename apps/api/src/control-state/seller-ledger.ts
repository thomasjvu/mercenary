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

export function getSellerStats(
  ctx: ControlStateContext,
  providerIds: string[],
  nowMs = Date.now()
): {
  grossUsd: number;
  payoutCount: number;
  routedRequests24h: number;
  earnings24hUsd: number;
  payouts: SellerPayoutEntry[];
} {
  const payouts = listSellerPayouts(ctx, providerIds, 500, nowMs);
  const metrics24h = computeSellerPayout24hMetrics(payouts, nowMs);
  return {
    grossUsd: payouts.reduce((sum, entry) => sum + entry.grossUsd, 0),
    payoutCount: payouts.length,
    routedRequests24h: metrics24h.routedRequests24h,
    earnings24hUsd: metrics24h.earnedBySellers24hUsd,
    payouts,
  };
}
