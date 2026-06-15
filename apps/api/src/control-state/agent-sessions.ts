import type { AgentPaymentSessionEntry } from './types.js';
import type { ControlStateContext } from './state-context.js';

export function upsertAgentPaymentSession(
  context: ControlStateContext,
  entry: AgentPaymentSessionEntry
): AgentPaymentSessionEntry {
  const snapshot = context.loadWorkingSnapshot();
  const wallet = entry.wallet.toLowerCase();
  const next = snapshot.agentPaymentSessions.filter(
    (session) => session.wallet.toLowerCase() !== wallet
  );
  next.push({
    ...entry,
    wallet,
  });
  snapshot.agentPaymentSessions = next;
  context.writeState(snapshot);
  return entry;
}

export function getAgentPaymentSession(
  context: ControlStateContext,
  wallet: string
): AgentPaymentSessionEntry | undefined {
  const normalized = wallet.toLowerCase();
  return context
    .loadWorkingSnapshot()
    .agentPaymentSessions.find((session) => session.wallet.toLowerCase() === normalized);
}

export function deleteAgentPaymentSession(context: ControlStateContext, wallet: string): void {
  const snapshot = context.loadWorkingSnapshot();
  const normalized = wallet.toLowerCase();
  snapshot.agentPaymentSessions = snapshot.agentPaymentSessions.filter(
    (session) => session.wallet.toLowerCase() !== normalized
  );
  context.writeState(snapshot);
}
