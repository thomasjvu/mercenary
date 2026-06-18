import type { X402ReconciliationEntry } from './types.js';
import type { ControlStateContext } from './state-context.js';

const MAX_STORED_ENTRIES = 500;

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
