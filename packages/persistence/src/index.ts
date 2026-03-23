import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BossRaidPersistenceSnapshot } from "@bossraid/shared-types";

export interface BossRaidPersistence {
  loadState(): Promise<BossRaidPersistenceSnapshot>;
  saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void>;
}

export function createEmptyPersistenceSnapshot(): BossRaidPersistenceSnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [],
    launchReservations: [],
  };
}

export class InMemoryBossRaidPersistence implements BossRaidPersistence {
  private snapshot = createEmptyPersistenceSnapshot();

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    return this.snapshot;
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

export class FileBossRaidPersistence implements BossRaidPersistence {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as BossRaidPersistenceSnapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return createEmptyPersistenceSnapshot();
      }
      throw error;
    }
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    await writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
    await rename(tempPath, this.path);
  }
}
