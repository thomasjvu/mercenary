import type { DemoRequestMode, LiveRaidRun } from '../demo-result';
import {
  createMercenaryThread,
  findMercenaryThread,
  loadMercenaryThreadStore,
  type MercenaryThreadRecord,
  type MercenaryThreadStore,
} from './mercenary-threads.js';

export function resolveInitialRaidDemoThreadState(persistThreads: boolean) {
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

export function buildRaidDemoThreadPersistenceSignature(input: {
  threadId: string;
  mode: DemoRequestMode;
  brief: string;
  submittedBrief: string | null;
  run: LiveRaidRun | null;
  error: string | null;
}) {
  return JSON.stringify({
    activeThreadId: input.threadId,
    demoMode: input.mode,
    liveDemoBrief: input.brief,
    lastSubmittedBrief: input.submittedBrief,
    liveRaidRun: input.run,
    launchError: input.error,
  });
}

export function applyRaidDemoThreadRecord(thread: MercenaryThreadRecord) {
  return {
    demoMode: thread.demoMode,
    liveDemoBrief: thread.liveDemoBrief,
    lastSubmittedBrief: thread.lastSubmittedBrief,
    liveRaidRun: thread.liveRaidRun,
    launchError: thread.launchError,
    persistenceSignature: buildRaidDemoThreadPersistenceSignature({
      threadId: thread.id,
      mode: thread.demoMode,
      brief: thread.liveDemoBrief,
      submittedBrief: thread.lastSubmittedBrief,
      run: thread.liveRaidRun,
      error: thread.launchError,
    }),
  };
}

export type { MercenaryThreadRecord, MercenaryThreadStore };
