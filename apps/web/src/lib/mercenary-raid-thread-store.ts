import type { LiveRaidRun } from '../mercenary-result';
import {
  createMercenaryThread,
  findMercenaryThread,
  loadMercenaryThreadStore,
  type MercenaryThreadRecord,
  type MercenaryThreadStore,
} from './mercenary-threads.js';

export function resolveInitialMercenaryRaidThreadState(persistThreads: boolean) {
  const store = persistThreads ? loadMercenaryThreadStore() : null;
  const thread =
    store != null
      ? (findMercenaryThread(store, store.activeThreadId) ?? createMercenaryThread())
      : createMercenaryThread();

  return {
    store: store ?? { activeThreadId: thread.id, threads: [thread] },
    thread,
  };
}

export function buildMercenaryRaidThreadPersistenceSignature(input: {
  threadId: string;
  maxBudgetUsd: number;
  brief: string;
  submittedBrief: string | null;
  run: LiveRaidRun | null;
  error: string | null;
}) {
  return JSON.stringify({
    activeThreadId: input.threadId,
    maxBudgetUsd: input.maxBudgetUsd,
    raidBrief: input.brief,
    lastSubmittedBrief: input.submittedBrief,
    liveRaidRun: input.run,
    launchError: input.error,
  });
}

export function applyMercenaryRaidThreadRecord(thread: MercenaryThreadRecord) {
  return {
    maxBudgetUsd: thread.maxBudgetUsd,
    raidBrief: thread.raidBrief,
    lastSubmittedBrief: thread.lastSubmittedBrief,
    liveRaidRun: thread.liveRaidRun,
    launchError: thread.launchError,
    persistenceSignature: buildMercenaryRaidThreadPersistenceSignature({
      threadId: thread.id,
      maxBudgetUsd: thread.maxBudgetUsd,
      brief: thread.raidBrief,
      submittedBrief: thread.lastSubmittedBrief,
      run: thread.liveRaidRun,
      error: thread.launchError,
    }),
  };
}

export type { MercenaryThreadRecord, MercenaryThreadStore };
