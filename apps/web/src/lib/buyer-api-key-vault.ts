export type SavedBuyerApiKey = {
  id: string;
  name: string;
  prefix: string;
  apiKey: string;
  createdAt: string;
};

const STORAGE_KEY = 'bossraid.buyerApiKeys';

function readVault(): SavedBuyerApiKey[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is SavedBuyerApiKey =>
        typeof entry === 'object' &&
        entry != null &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.prefix === 'string' &&
        typeof entry.apiKey === 'string' &&
        typeof entry.createdAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeVault(entries: SavedBuyerApiKey[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function listSavedBuyerApiKeys(): SavedBuyerApiKey[] {
  return readVault().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getSavedBuyerApiKey(keyId: string): SavedBuyerApiKey | undefined {
  return readVault().find((entry) => entry.id === keyId);
}

export function saveBuyerApiKey(entry: SavedBuyerApiKey): void {
  const vault = readVault().filter((item) => item.id !== entry.id);
  vault.unshift(entry);
  writeVault(vault);
}

export function removeSavedBuyerApiKey(keyId: string): void {
  writeVault(readVault().filter((entry) => entry.id !== keyId));
}
