import type { MercenaryRequestMode, LiveRaidRun } from '../mercenary-result';
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
  mode: MercenaryRequestMode;
  brief: string;
  submittedBrief: string | null;
  run: LiveRaidRun | null;
  error: string | null;
}) {
  return JSON.stringify({
    activeThreadId: input.threadId,
    requestMode: input.mode,
    raidBrief: input.brief,
    lastSubmittedBrief: input.submittedBrief,
    liveRaidRun: input.run,
    launchError: input.error,
  });
}

export function applyMercenaryRaidThreadRecord(thread: MercenaryThreadRecord) {
  return {
    requestMode: thread.requestMode,
    raidBrief: thread.raidBrief,
    lastSubmittedBrief: thread.lastSubmittedBrief,
    liveRaidRun: thread.liveRaidRun,
    launchError: thread.launchError,
    persistenceSignature: buildMercenaryRaidThreadPersistenceSignature({
      threadId: thread.id,
      mode: thread.requestMode,
      brief: thread.raidBrief,
      submittedBrief: thread.lastSubmittedBrief,
      run: thread.liveRaidRun,
      error: thread.launchError,
    }),
  };
}

export type { MercenaryThreadRecord, MercenaryThreadStore };
