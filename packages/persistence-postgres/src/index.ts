import { createHash } from 'node:crypto';
import { createEmptyPersistenceSnapshot, type BossRaidPersistence } from '@bossraid/persistence';
import type { BossRaidPersistenceSnapshot } from '@bossraid/shared-types';
import pg from 'pg';
import { ORCHESTRATOR_SCHEMA_SQL } from './schema.js';

const { Pool } = pg;
const META_KEY = 1;

export { API_CONTROL_STATE_SCHEMA_SQL, ORCHESTRATOR_SCHEMA_SQL } from './schema.js';

function raidPersistRevision(raid: BossRaidPersistenceSnapshot['raids'][number]): string {
  const { updatedAt: _updatedAt, ...rest } = raid;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

function providerPersistRevision(
  provider: BossRaidPersistenceSnapshot['providers'][number]
): string {
  const { lastSeenAt: _lastSeenAt, ...rest } = provider;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

export type PostgresPool = pg.Pool;

export function createPostgresPool(databaseUrl: string): PostgresPool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

/**
 * Orchestrator raid/provider/reservation store on Postgres.
 * Compatible schema with SQLite tables (JSON payloads).
 */
export class PostgresBossRaidPersistence implements BossRaidPersistence {
  private readonly pool: PostgresPool;
  private initPromise?: Promise<void>;
  private readonly raidRevisionCache = new Map<string, string>();
  private readonly providerRevisionCache = new Map<string, string>();

  constructor(databaseUrlOrPool: string | PostgresPool) {
    this.pool =
      typeof databaseUrlOrPool === 'string'
        ? createPostgresPool(databaseUrlOrPool)
        : databaseUrlOrPool;
  }

  async loadState(): Promise<BossRaidPersistenceSnapshot> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      const meta = await client.query<{ version: number; saved_at: string }>(
        'select version, saved_at from bossraid_meta where key = $1',
        [META_KEY]
      );
      const raids = await client.query<{ payload_json: string }>(
        'select payload_json from raid_records order by updated_at asc'
      );
      const providers = await client.query<{ payload_json: string }>(
        'select payload_json from provider_records order by updated_at asc'
      );
      const launchReservations = await client.query<{ payload_json: string }>(
        'select payload_json from launch_reservation_records order by updated_at asc'
      );

      if (
        meta.rowCount === 0 &&
        raids.rowCount === 0 &&
        providers.rowCount === 0 &&
        launchReservations.rowCount === 0
      ) {
        return createEmptyPersistenceSnapshot();
      }

      return {
        version: 1,
        savedAt: meta.rows[0]?.saved_at ?? new Date().toISOString(),
        raids: raids.rows.map((row) => JSON.parse(row.payload_json)),
        providers: providers.rows.map((row) => JSON.parse(row.payload_json)),
        launchReservations: launchReservations.rows.map((row) => JSON.parse(row.payload_json)),
      };
    } finally {
      client.release();
    }
  }

  async saveState(snapshot: BossRaidPersistenceSnapshot): Promise<void> {
    await this.ensureSchema();
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      await client.query(
        [
          'insert into bossraid_meta (key, version, saved_at)',
          'values ($1, $2, $3)',
          'on conflict (key) do update set',
          '  version = excluded.version,',
          '  saved_at = excluded.saved_at',
        ].join(' '),
        [META_KEY, snapshot.version, snapshot.savedAt]
      );

      const raidIds = snapshot.raids.map((raid) => raid.id);
      const providerIds = snapshot.providers.map((provider) => provider.providerId);
      const reservationIds = (snapshot.launchReservations ?? []).map(
        (reservation) => reservation.id
      );

      for (const raid of snapshot.raids) {
        const revision = raidPersistRevision(raid);
        if (this.raidRevisionCache.get(raid.id) === revision) {
          continue;
        }
        await client.query(
          [
            'insert into raid_records (raid_id, updated_at, payload_json)',
            'values ($1, $2, $3)',
            'on conflict (raid_id) do update set',
            '  updated_at = excluded.updated_at,',
            '  payload_json = excluded.payload_json',
          ].join(' '),
          [raid.id, snapshot.savedAt, JSON.stringify(raid)]
        );
        this.raidRevisionCache.set(raid.id, revision);
      }

      for (const provider of snapshot.providers) {
        const revision = providerPersistRevision(provider);
        if (this.providerRevisionCache.get(provider.providerId) === revision) {
          continue;
        }
        await client.query(
          [
            'insert into provider_records (provider_id, updated_at, payload_json)',
            'values ($1, $2, $3)',
            'on conflict (provider_id) do update set',
            '  updated_at = excluded.updated_at,',
            '  payload_json = excluded.payload_json',
          ].join(' '),
          [provider.providerId, snapshot.savedAt, JSON.stringify(provider)]
        );
        this.providerRevisionCache.set(provider.providerId, revision);
      }

      for (const reservation of snapshot.launchReservations ?? []) {
        await client.query(
          [
            'insert into launch_reservation_records (reservation_id, updated_at, payload_json)',
            'values ($1, $2, $3)',
            'on conflict (reservation_id) do update set',
            '  updated_at = excluded.updated_at,',
            '  payload_json = excluded.payload_json',
          ].join(' '),
          [reservation.id, snapshot.savedAt, JSON.stringify(reservation)]
        );
      }

      if (raidIds.length > 0) {
        await client.query('delete from raid_records where not (raid_id = any($1::text[]))', [
          raidIds,
        ]);
      } else {
        await client.query('delete from raid_records');
      }

      if (providerIds.length > 0) {
        await client.query(
          'delete from provider_records where not (provider_id = any($1::text[]))',
          [providerIds]
        );
      } else {
        await client.query('delete from provider_records');
      }

      if (reservationIds.length > 0) {
        await client.query(
          'delete from launch_reservation_records where not (reservation_id = any($1::text[]))',
          [reservationIds]
        );
      } else {
        await client.query('delete from launch_reservation_records');
      }

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    this.initPromise ??= (async () => {
      await this.pool.query(ORCHESTRATOR_SCHEMA_SQL);
    })();
    await this.initPromise;
  }
}
