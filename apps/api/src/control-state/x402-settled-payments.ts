import { createHash } from 'node:crypto';
import { ensurePublicAccountInSnapshot } from './sessions.js';
import type { ControlStateContext } from './state-context.js';
import type { X402SettledPaymentEntry } from './types.js';

export type { X402SettledPaymentEntry };

/** Keep settled payment fingerprints for 90 days (anti double-credit), not a short LRU. */
const SETTLED_PAYMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Hard safety cap against unbounded growth under pathological load. */
const MAX_STORED_ENTRIES = 100_000;

export function buildX402SettlementFingerprint(input: {
  settlementTx?: string;
  paymentSignature?: string;
}): string | undefined {
  const tx = input.settlementTx?.trim();
  if (tx) {
    return `tx:${tx.toLowerCase()}`;
  }
  const signature = input.paymentSignature?.trim();
  if (!signature) {
    return undefined;
  }
  return `sig:${createHash('sha256').update(signature).digest('hex')}`;
}

function isSettledPaymentFresh(entry: X402SettledPaymentEntry, nowMs: number): boolean {
  const createdAtMs = Date.parse(entry.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  return nowMs - createdAtMs <= SETTLED_PAYMENT_TTL_MS;
}

export function pruneX402SettledPayments(
  entries: X402SettledPaymentEntry[],
  nowMs = Date.now()
): X402SettledPaymentEntry[] {
  const fresh = entries.filter((entry) => isSettledPaymentFresh(entry, nowMs));
  if (fresh.length <= MAX_STORED_ENTRIES) {
    return fresh;
  }
  // Prefer newest when over the absolute safety cap.
  return fresh
    .slice()
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-MAX_STORED_ENTRIES);
}

export function hasX402SettledPayment(context: ControlStateContext, fingerprint: string): boolean {
  const nowMs = Date.now();
  return context
    .loadWorkingSnapshot()
    .x402SettledPayments.some(
      (entry) => entry.fingerprint === fingerprint && isSettledPaymentFresh(entry, nowMs)
    );
}

export function recordX402SettledPayment(
  context: ControlStateContext,
  entry: X402SettledPaymentEntry
): X402SettledPaymentEntry {
  const snapshot = context.loadWorkingSnapshot();
  const next = snapshot.x402SettledPayments.filter(
    (item) => item.fingerprint !== entry.fingerprint
  );
  next.push(entry);
  snapshot.x402SettledPayments = pruneX402SettledPayments(next);
  context.writeState(snapshot);
  return entry;
}

export type ClaimX402SettledPaymentResult =
  | { status: 'claimed' }
  | { status: 'duplicate' }
  | { status: 'same_reservation' };

/**
 * Atomically claim a settled-payment fingerprint (no balance side effects).
 * Uses mutateState so concurrent writers cannot double-claim after x402 settle.
 * When `reservationId` matches an existing claim, returns `same_reservation` for crash re-entry.
 */
export function tryClaimX402SettledPaymentDetailed(
  context: ControlStateContext,
  entry: X402SettledPaymentEntry,
  nowMs = Date.now()
): ClaimX402SettledPaymentResult {
  let result: ClaimX402SettledPaymentResult = { status: 'duplicate' };
  try {
    context.mutateState((snapshot) => {
      const existing = snapshot.x402SettledPayments.find(
        (item) => item.fingerprint === entry.fingerprint && isSettledPaymentFresh(item, nowMs)
      );
      if (existing) {
        if (
          entry.reservationId &&
          existing.reservationId &&
          entry.reservationId === existing.reservationId
        ) {
          result = { status: 'same_reservation' };
        } else {
          result = { status: 'duplicate' };
        }
        return;
      }
      const next = snapshot.x402SettledPayments.filter(
        (item) => item.fingerprint !== entry.fingerprint
      );
      next.push(entry);
      snapshot.x402SettledPayments = pruneX402SettledPayments(next, nowMs);
      result = { status: 'claimed' };
    }, nowMs);
  } catch {
    result = { status: 'duplicate' };
  }
  return result;
}

/** Boolean wrapper for bounty/balance paths (true = newly claimed). */
export function tryClaimX402SettledPayment(
  context: ControlStateContext,
  entry: X402SettledPaymentEntry,
  nowMs = Date.now()
): boolean {
  return tryClaimX402SettledPaymentDetailed(context, entry, nowMs).status === 'claimed';
}

export function tryClaimX402SettledPaymentAndCredit(
  context: ControlStateContext,
  entry: X402SettledPaymentEntry,
  nowMs = Date.now()
): { claimed: true; balanceUsd: number } | { claimed: false; balanceUsd: number } {
  let result: { claimed: true; balanceUsd: number } | { claimed: false; balanceUsd: number } = {
    claimed: false,
    balanceUsd: 0,
  };
  try {
    context.mutateState((snapshot) => {
      if (
        snapshot.x402SettledPayments.some(
          (item) => item.fingerprint === entry.fingerprint && isSettledPaymentFresh(item, nowMs)
        )
      ) {
        const account = ensurePublicAccountInSnapshot(snapshot, entry.wallet);
        result = { claimed: false, balanceUsd: account.balanceUsd };
        return;
      }
      const next = snapshot.x402SettledPayments.filter(
        (item) => item.fingerprint !== entry.fingerprint
      );
      next.push(entry);
      snapshot.x402SettledPayments = pruneX402SettledPayments(next, nowMs);
      const account = ensurePublicAccountInSnapshot(snapshot, entry.wallet);
      account.balanceUsd += Math.max(0, entry.amountUsd);
      account.updatedAt = new Date(nowMs).toISOString();
      result = { claimed: true, balanceUsd: account.balanceUsd };
    }, nowMs);
  } catch {
    const account = context
      .loadWorkingSnapshot()
      .publicAccounts.find((item) => item.wallet === entry.wallet.toLowerCase());
    result = { claimed: false, balanceUsd: account?.balanceUsd ?? 0 };
  }
  return result;
}

export function releaseX402SettledPayment(context: ControlStateContext, fingerprint: string): void {
  const snapshot = context.loadWorkingSnapshot();
  const next = snapshot.x402SettledPayments.filter((item) => item.fingerprint !== fingerprint);
  if (next.length === snapshot.x402SettledPayments.length) {
    return;
  }
  snapshot.x402SettledPayments = next;
  context.writeState(snapshot);
}
