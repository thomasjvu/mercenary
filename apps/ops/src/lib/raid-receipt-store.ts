const STORAGE_KEY = 'bossraid.ops.receipt-tokens';

export type StoredRaidReceipt = {
  raidId: string;
  raidAccessToken: string;
  receiptPath: string;
  storedAt: string;
};

function readStore(): Record<string, StoredRaidReceipt> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, StoredRaidReceipt>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredRaidReceipt>): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function rememberRaidReceipt(input: {
  raidId: string;
  raidAccessToken: string;
  receiptPath: string;
}): StoredRaidReceipt {
  const store = readStore();
  const entry: StoredRaidReceipt = {
    raidId: input.raidId,
    raidAccessToken: input.raidAccessToken,
    receiptPath: input.receiptPath,
    storedAt: new Date().toISOString(),
  };
  store[input.raidId] = entry;
  writeStore(store);
  return entry;
}

export function readRaidReceipt(raidId: string | null | undefined): StoredRaidReceipt | null {
  if (!raidId) {
    return null;
  }
  return readStore()[raidId] ?? null;
}

export function listRaidReceipts(): StoredRaidReceipt[] {
  return Object.values(readStore()).sort((left, right) =>
    right.storedAt.localeCompare(left.storedAt)
  );
}
