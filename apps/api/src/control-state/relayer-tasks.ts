import type { RelayerTaskEntry } from './types.js';
import type { ControlStateContext } from './state-context.js';

export function upsertRelayerTask(
  context: ControlStateContext,
  entry: RelayerTaskEntry
): RelayerTaskEntry {
  const snapshot = context.loadWorkingSnapshot();
  const next = snapshot.relayerTasks.filter((task) => task.taskId !== entry.taskId);
  next.push(entry);
  snapshot.relayerTasks = next;
  context.writeState(snapshot);
  return entry;
}

export function getRelayerTask(
  context: ControlStateContext,
  taskId: string
): RelayerTaskEntry | undefined {
  return context.loadWorkingSnapshot().relayerTasks.find((task) => task.taskId === taskId);
}
