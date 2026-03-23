import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createEmptyPersistenceSnapshot,
  type BossRaidPersistence,
} from "@bossraid/persistence";
import type { BossRaidPersistenceSnapshot } from "@bossraid/shared-types";

const SNAPSHOT_KEY = 1;

export class SqliteBossRaidPersistence implements BossRaidPersistence {
  private db?: DatabaseSync;
  private initPromise?: Promise<DatabaseSync>;

  constructor(private readonly path: string) {}

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    const db = await this.open();
    const row = db
      .prepare("select snapshot_json from bossraid_state where key = ?")
      .get(SNAPSHOT_KEY) as { snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return createEmptyPersistenceSnapshot();
    }

    return JSON.parse(row.snapshot_json) as BossRaidPersistenceSnapshot;
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    const db = await this.open();
    db.exec("begin immediate");

    try {
      db.prepare(
        [
          "insert into bossraid_state (key, version, saved_at, snapshot_json)",
          "values (?, ?, ?, ?)",
          "on conflict(key) do update set",
          "  version = excluded.version,",
          "  saved_at = excluded.saved_at,",
          "  snapshot_json = excluded.snapshot_json",
        ].join(" "),
      ).run(
        SNAPSHOT_KEY,
        snapshot.version,
        snapshot.savedAt,
        JSON.stringify(snapshot),
      );
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }

  private async open(): Promise<DatabaseSync> {
    if (this.db) {
      return this.db;
    }

    this.initPromise ??= this.initialize();
    this.db = await this.initPromise;
    return this.db;
  }

  private async initialize(): Promise<DatabaseSync> {
    await mkdir(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path);

    db.exec(
      [
        "create table if not exists bossraid_state (",
        "  key integer primary key check(key = 1),",
        "  version integer not null,",
        "  saved_at text not null,",
        "  snapshot_json text not null",
        ")",
      ].join(" "),
    );

    return db;
  }
}
