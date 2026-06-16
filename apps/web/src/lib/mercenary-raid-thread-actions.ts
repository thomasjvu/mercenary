import {
  createMercenaryThread,
  findMercenaryThread,
  upsertMercenaryThread,
  type MercenaryThreadRecord,
  type MercenaryThreadStore,
} from './mercenary-threads.js';

export function buildSelectThreadStore(
  store: MercenaryThreadStore,
  currentSnapshot: MercenaryThreadRecord,
  threadId: string
): { store: MercenaryThreadStore; thread: MercenaryThreadRecord } | null {
  if (threadId === store.activeThreadId) {
    return null;
  }

  const nextStore = {
    activeThreadId: threadId,
    threads: upsertMercenaryThread(store, currentSnapshot).threads,
  };
  const nextThread = findMercenaryThread(nextStore, threadId);
  if (!nextThread) {
    return null;
  }

  return { store: nextStore, thread: nextThread };
}

export function buildStartNewThreadStore(
  store: MercenaryThreadStore,
  currentSnapshot: MercenaryThreadRecord
): { store: MercenaryThreadStore; thread: MercenaryThreadRecord } {
  const mergedStore = upsertMercenaryThread(store, currentSnapshot);
  const newThread = createMercenaryThread();
  return {
    store: {
      activeThreadId: newThread.id,
      threads: [newThread, ...mergedStore.threads],
    },
    thread: newThread,
  };
}

export function buildRenameThreadStore(
  store: MercenaryThreadStore,
  activeThreadId: string,
  threadId: string,
  title: string
): MercenaryThreadStore {
  const trimmed = title.trim() || 'New thread';
  return {
    activeThreadId,
    threads: store.threads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            title: trimmed,
            titleLocked: true,
            updatedAt: new Date().toISOString(),
          }
        : thread
    ),
  };
}

export function buildDeleteThreadStore(
  store: MercenaryThreadStore,
  currentSnapshot: MercenaryThreadRecord,
  activeThreadId: string,
  threadId: string
): { store: MercenaryThreadStore; thread?: MercenaryThreadRecord } {
  const mergedThreads = upsertMercenaryThread(store, currentSnapshot).threads;
  const nextThreads = mergedThreads.filter((thread) => thread.id !== threadId);

  if (nextThreads.length === 0) {
    const fresh = createMercenaryThread();
    return {
      store: { activeThreadId: fresh.id, threads: [fresh] },
      thread: fresh,
    };
  }

  const deletingActive = threadId === activeThreadId;
  const nextActiveId = deletingActive ? nextThreads[0]!.id : activeThreadId;
  return {
    store: { activeThreadId: nextActiveId, threads: nextThreads },
    thread: deletingActive ? nextThreads[0] : undefined,
  };
}
