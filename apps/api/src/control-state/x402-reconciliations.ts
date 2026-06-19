import { randomUUID } from 'node:crypto';
import type { X402ReconciliationEntry } from './types.js';
import type { ControlStateContext } from './state-context.js';

const MAX_STORED_ENTRIES = 500;
const DEFAULT_CLAIM_LEASE_MS = 60_000;

export function upsertX402Reconciliation(
  context: ControlStateContext,
  entry: X402ReconciliationEntry
): X402ReconciliationEntry {
  const snapshot = context.loadWorkingSnapshot();
  const next = snapshot.x402Reconciliations.filter((item) => item.id !== entry.id);
  next.push(entry);
  snapshot.x402Reconciliations = next.slice(-MAX_STORED_ENTRIES);
  context.writeState(snapshot);
  return entry;
}

export function listPendingX402Reconciliations(
  context: ControlStateContext,
  limit = 25
): X402ReconciliationEntry[] {
  return context
    .loadWorkingSnapshot()
    .x402Reconciliations.filter((entry) => entry.status === 'pending')
    .slice(0, limit);
}

export function getX402Reconciliation(
  context: ControlStateContext,
  id: string
): X402ReconciliationEntry | undefined {
  return context.loadWorkingSnapshot().x402Reconciliations.find((entry) => entry.id === id);
}

export function tryClaimX402Reconciliation(
  context: ControlStateContext,
  entryId: string,
  holderId: string,
  leaseMs = DEFAULT_CLAIM_LEASE_MS,
  nowMs = Date.now()
): X402ReconciliationEntry | undefined {
  let claimed: X402ReconciliationEntry | undefined;
  context.mutateState((snapshot) => {
    const entry = snapshot.x402Reconciliations.find((item) => item.id === entryId);
    if (!entry || entry.status !== 'pending') {
      return;
    }
    if (
      entry.processingHolder &&
      entry.processingHolder !== holderId &&
      entry.processingExpiresAt &&
      Date.parse(entry.processingExpiresAt) > nowMs
    ) {
      return;
    }

    const updated: X402ReconciliationEntry = {
      ...entry,
      processingHolder: holderId,
      processingExpiresAt: new Date(nowMs + leaseMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    };
    snapshot.x402Reconciliations = snapshot.x402Reconciliations.map((item) =>
      item.id === entryId ? updated : item
    );
    claimed = updated;
  }, nowMs);
  return claimed;
}

export function createX402ReconciliationHolderId(): string {
  return `x402worker_${randomUUID().replace(/-/g, '')}`;
}
