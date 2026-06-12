import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createEmptyPersistenceSnapshot, type BossRaidPersistence } from '@bossraid/persistence';
import type { BossRaidPersistenceSnapshot } from '@bossraid/shared-types';

const META_KEY = 1;

export class SqliteBossRaidPersistence implements BossRaidPersistence {
  private db?: DatabaseSync;
  private initPromise?: Promise<DatabaseSync>;

  constructor(private readonly path: string) {}

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    const db = await this.open();
    await this.migrateLegacySnapshot(db);

    const meta = db
      .prepare('select version, saved_at from bossraid_meta where key = ?')
      .get(META_KEY) as { version?: number; saved_at?: string } | undefined;

    const raids = (
      db.prepare('select payload_json from raid_records order by updated_at asc').all() as Array<{
        payload_json: string;
      }>
    ).map((row) => JSON.parse(row.payload_json));

    const providers = (
      db
        .prepare('select payload_json from provider_records order by updated_at asc')
        .all() as Array<{ payload_json: string }>
    ).map((row) => JSON.parse(row.payload_json));

    const launchReservations = (
      db
        .prepare('select payload_json from launch_reservation_records order by updated_at asc')
        .all() as Array<{ payload_json: string }>
    ).map((row) => JSON.parse(row.payload_json));

    if (!meta && raids.length === 0 && providers.length === 0 && launchReservations.length === 0) {
      return createEmptyPersistenceSnapshot();
    }

    return {
      version: 1,
      savedAt: meta?.saved_at ?? new Date().toISOString(),
      raids,
      providers,
      launchReservations,
    };
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    const db = await this.open();
    db.exec('begin immediate');

    try {
      db.prepare(
        [
          'insert into bossraid_meta (key, version, saved_at)',
          'values (?, ?, ?)',
          'on conflict(key) do update set',
          '  version = excluded.version,',
          '  saved_at = excluded.saved_at',
        ].join(' ')
      ).run(META_KEY, snapshot.version, snapshot.savedAt);

      const raidIds = new Set(snapshot.raids.map((raid) => raid.id));
      const providerIds = new Set(snapshot.providers.map((provider) => provider.providerId));
      const reservationIds = new Set(
        (snapshot.launchReservations ?? []).map((reservation) => reservation.id)
      );

      const upsertRaid = db.prepare(
        [
          'insert into raid_records (raid_id, updated_at, payload_json)',
          'values (?, ?, ?)',
          'on conflict(raid_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      );
      const upsertProvider = db.prepare(
        [
          'insert into provider_records (provider_id, updated_at, payload_json)',
          'values (?, ?, ?)',
          'on conflict(provider_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      );
      const upsertReservation = db.prepare(
        [
          'insert into launch_reservation_records (reservation_id, updated_at, payload_json)',
          'values (?, ?, ?)',
          'on conflict(reservation_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      );

      for (const raid of snapshot.raids) {
        upsertRaid.run(raid.id, snapshot.savedAt, JSON.stringify(raid));
      }
      for (const provider of snapshot.providers) {
        upsertProvider.run(provider.providerId, snapshot.savedAt, JSON.stringify(provider));
      }
      for (const reservation of snapshot.launchReservations ?? []) {
        upsertReservation.run(reservation.id, snapshot.savedAt, JSON.stringify(reservation));
      }

      if (raidIds.size > 0) {
        const placeholders = Array.from(raidIds)
          .map(() => '?')
          .join(', ');
        db.prepare(`delete from raid_records where raid_id not in (${placeholders})`).run(
          ...Array.from(raidIds)
        );
      } else {
        db.prepare('delete from raid_records').run();
      }

      if (providerIds.size > 0) {
        const placeholders = Array.from(providerIds)
          .map(() => '?')
          .join(', ');
        db.prepare(`delete from provider_records where provider_id not in (${placeholders})`).run(
          ...Array.from(providerIds)
        );
      } else {
        db.prepare('delete from provider_records').run();
      }

      if (reservationIds.size > 0) {
        const placeholders = Array.from(reservationIds)
          .map(() => '?')
          .join(', ');
        db.prepare(
          `delete from launch_reservation_records where reservation_id not in (${placeholders})`
        ).run(...Array.from(reservationIds));
      } else {
        db.prepare('delete from launch_reservation_records').run();
      }

      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
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
        'create table if not exists bossraid_meta (',
        '  key integer primary key check(key = 1),',
        '  version integer not null,',
        '  saved_at text not null',
        ');',
        'create table if not exists raid_records (',
        '  raid_id text primary key,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists provider_records (',
        '  provider_id text primary key,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists launch_reservation_records (',
        '  reservation_id text primary key,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists bossraid_state (',
        '  key integer primary key check(key = 1),',
        '  version integer not null,',
        '  saved_at text not null,',
        '  snapshot_json text not null',
        ');',
      ].join('\n')
    );

    return db;
  }

  private async migrateLegacySnapshot(db: DatabaseSync): Promise<void> {
    const existingRaids = db.prepare('select count(*) as count from raid_records').get() as {
      count: number;
    };
    if (existingRaids.count > 0) {
      return;
    }

    const legacy = db
      .prepare('select snapshot_json from bossraid_state where key = ?')
      .get(META_KEY) as { snapshot_json?: string } | undefined;

    if (!legacy?.snapshot_json) {
      return;
    }

    const snapshot = JSON.parse(legacy.snapshot_json) as BossRaidPersistenceSnapshot;
    await this.saveState(snapshot);
  }
}
