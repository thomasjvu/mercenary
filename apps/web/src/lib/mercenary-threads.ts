import type { MercenaryRequestMode, LiveRaidRun } from '../mercenary-result.js';

export type MercenaryThreadRecord = {
  id: string;
  title: string;
  titleLocked?: boolean;
  updatedAt: string;
  requestMode: MercenaryRequestMode;
  raidBrief: string;
  lastSubmittedBrief: string | null;
  liveRaidRun: LiveRaidRun | null;
  launchError: string | null;
};

export type MercenaryThreadStore = {
  activeThreadId: string;
  threads: MercenaryThreadRecord[];
};

const STORAGE_KEY = 'bossraid.mercenary.threads.v2';
const MAX_THREADS = 24;

export function createMercenaryThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveMercenaryThreadTitle(input: {
  lastSubmittedBrief?: string | null;
  raidBrief?: string;
}): string {
  const source = input.lastSubmittedBrief?.trim() || input.raidBrief?.trim();
  if (!source) {
    return 'New thread';
  }

  const singleLine = source.replace(/\s+/g, ' ').trim();
  return singleLine.length > 42 ? `${singleLine.slice(0, 42)}…` : singleLine;
}

export function createMercenaryThread(
  overrides: Partial<MercenaryThreadRecord> = {}
): MercenaryThreadRecord {
  const now = new Date().toISOString();
  return {
    id: createMercenaryThreadId(),
    title: 'New thread',
    updatedAt: now,
    requestMode: 'raid',
    raidBrief: '',
    lastSubmittedBrief: null,
    liveRaidRun: null,
    launchError: null,
    ...overrides,
  };
}

export function loadMercenaryThreadStore(): MercenaryThreadStore {
  if (typeof window === 'undefined') {
    const thread = createMercenaryThread();
    return { activeThreadId: thread.id, threads: [thread] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const thread = createMercenaryThread();
      return { activeThreadId: thread.id, threads: [thread] };
    }

    const parsed = JSON.parse(raw) as MercenaryThreadStore;
    if (!parsed?.activeThreadId || !Array.isArray(parsed.threads) || parsed.threads.length === 0) {
      const thread = createMercenaryThread();
      return { activeThreadId: thread.id, threads: [thread] };
    }

    const activeExists = parsed.threads.some((thread) => thread.id === parsed.activeThreadId);
    return {
      activeThreadId: activeExists ? parsed.activeThreadId : parsed.threads[0]!.id,
      threads: parsed.threads,
    };
  } catch {
    const thread = createMercenaryThread();
    return { activeThreadId: thread.id, threads: [thread] };
  }
}

export function persistMercenaryThreadStore(store: MercenaryThreadStore): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function upsertMercenaryThread(
  store: MercenaryThreadStore,
  record: MercenaryThreadRecord
): MercenaryThreadStore {
  const existingIndex = store.threads.findIndex((thread) => thread.id === record.id);
  const nextThreads =
    existingIndex === -1
      ? [record, ...store.threads]
      : store.threads.map((thread, index) => (index === existingIndex ? record : thread));

  const sorted = [...nextThreads].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );

  return {
    activeThreadId: store.activeThreadId,
    threads: sorted.slice(0, MAX_THREADS),
  };
}

export function findMercenaryThread(
  store: MercenaryThreadStore,
  threadId: string
): MercenaryThreadRecord | undefined {
  return store.threads.find((thread) => thread.id === threadId);
}
