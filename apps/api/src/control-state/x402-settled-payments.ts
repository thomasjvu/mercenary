import { createHash } from 'node:crypto';
import { ensurePublicAccountInSnapshot } from './sessions.js';
import type { ControlStateContext } from './state-context.js';

export type X402SettledPaymentEntry = {
  fingerprint: string;
  wallet: string;
  route: 'balance' | 'bounty';
  amountUsd: number;
  createdAt: string;
};

const MAX_STORED_ENTRIES = 1_000;

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

export function hasX402SettledPayment(context: ControlStateContext, fingerprint: string): boolean {
  return context
    .loadWorkingSnapshot()
    .x402SettledPayments.some((entry) => entry.fingerprint === fingerprint);
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
  snapshot.x402SettledPayments = next.slice(-MAX_STORED_ENTRIES);
  context.writeState(snapshot);
  return entry;
}

export function tryClaimX402SettledPayment(
  context: ControlStateContext,
  entry: X402SettledPaymentEntry
): boolean {
  const snapshot = context.loadWorkingSnapshot();
  if (snapshot.x402SettledPayments.some((item) => item.fingerprint === entry.fingerprint)) {
    return false;
  }
  recordX402SettledPayment(context, entry);
  return true;
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
      if (snapshot.x402SettledPayments.some((item) => item.fingerprint === entry.fingerprint)) {
        const account = ensurePublicAccountInSnapshot(snapshot, entry.wallet);
        result = { claimed: false, balanceUsd: account.balanceUsd };
        return;
      }
      const next = snapshot.x402SettledPayments.filter(
        (item) => item.fingerprint !== entry.fingerprint
      );
      next.push(entry);
      snapshot.x402SettledPayments = next.slice(-MAX_STORED_ENTRIES);
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
