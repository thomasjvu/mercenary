import type { LiveRaidRun } from '../mercenary-result.js';
import { DEFAULT_MERCENARY_BUDGET_USD } from '../mercenary-result.js';

export type MercenaryThreadRecord = {
  id: string;
  title: string;
  titleLocked?: boolean;
  updatedAt: string;
  maxBudgetUsd: number;
  raidBrief: string;
  lastSubmittedBrief: string | null;
  liveRaidRun: LiveRaidRun | null;
  launchError: string | null;
};

export type MercenaryThreadStore = {
  activeThreadId: string;
  threads: MercenaryThreadRecord[];
};

const STORAGE_KEY = 'bossraid.mercenary.threads.v3';
const LEGACY_STORAGE_KEY = 'bossraid.mercenary.threads.v2';
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
    maxBudgetUsd: DEFAULT_MERCENARY_BUDGET_USD,
    raidBrief: '',
    lastSubmittedBrief: null,
    liveRaidRun: null,
    launchError: null,
    ...overrides,
  };
}

function normalizeLegacyThread(
  thread: MercenaryThreadRecord & { requestMode?: string }
): MercenaryThreadRecord {
  return {
    id: thread.id,
    title: thread.title,
    titleLocked: thread.titleLocked,
    updatedAt: thread.updatedAt,
    maxBudgetUsd:
      typeof thread.maxBudgetUsd === 'number' && Number.isFinite(thread.maxBudgetUsd)
        ? thread.maxBudgetUsd
        : DEFAULT_MERCENARY_BUDGET_USD,
    raidBrief: thread.raidBrief ?? '',
    lastSubmittedBrief: thread.lastSubmittedBrief ?? null,
    liveRaidRun: thread.liveRaidRun ?? null,
    launchError: thread.launchError ?? null,
  };
}

function readThreadStore(raw: string | null): MercenaryThreadStore | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as MercenaryThreadStore;
    if (!parsed?.activeThreadId || !Array.isArray(parsed.threads) || parsed.threads.length === 0) {
      return null;
    }

    const activeExists = parsed.threads.some((thread) => thread.id === parsed.activeThreadId);
    return {
      activeThreadId: activeExists ? parsed.activeThreadId : parsed.threads[0]!.id,
      threads: parsed.threads.map((thread) =>
        normalizeLegacyThread(thread as MercenaryThreadRecord & { requestMode?: string })
      ),
    };
  } catch {
    return null;
  }
}

export function loadMercenaryThreadStore(): MercenaryThreadStore {
  if (typeof window === 'undefined') {
    const thread = createMercenaryThread();
    return { activeThreadId: thread.id, threads: [thread] };
  }

  const current = readThreadStore(window.localStorage.getItem(STORAGE_KEY));
  if (current) {
    return current;
  }

  const legacy = readThreadStore(window.localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacy) {
    persistMercenaryThreadStore(legacy);
    return legacy;
  }

  const thread = createMercenaryThread();
  return { activeThreadId: thread.id, threads: [thread] };
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
