import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  BountyAwardRecord,
  BountyBidRecord,
  BountyEventRecord,
  BountyRecord,
} from '@bossraid/shared-types';

type Row = { payload_json: string };

export class BountyStore {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      [
        'create table if not exists bounty_records (',
        '  bounty_id text primary key,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists bounty_bid_records (',
        '  bid_id text primary key,',
        '  bounty_id text not null,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists bounty_award_records (',
        '  award_id text primary key,',
        '  bounty_id text not null,',
        '  updated_at text not null,',
        '  payload_json text not null',
        ');',
        'create table if not exists bounty_event_records (',
        '  event_id text primary key,',
        '  bounty_id text not null,',
        '  created_at text not null,',
        '  payload_json text not null',
        ');',
        'create index if not exists bounty_bids_by_bounty on bounty_bid_records (bounty_id);',
        'create index if not exists bounty_awards_by_bounty on bounty_award_records (bounty_id);',
        'create index if not exists bounty_events_by_bounty on bounty_event_records (bounty_id);',
      ].join('\n')
    );
  }

  createId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`;
  }

  saveBounty(record: BountyRecord): BountyRecord {
    this.db
      .prepare(
        [
          'insert into bounty_records (bounty_id, updated_at, payload_json)',
          'values (?, ?, ?)',
          'on conflict(bounty_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      )
      .run(record.id, record.updatedAt, JSON.stringify(record));
    return record;
  }

  getBounty(id: string): BountyRecord | undefined {
    return this.readOne('select payload_json from bounty_records where bounty_id = ?', id);
  }

  listBounties(options: { status?: BountyRecord['status']; limit?: number } = {}): BountyRecord[] {
    const rows = this.db
      .prepare('select payload_json from bounty_records order by updated_at desc')
      .all() as Row[];
    const records = rows.map((row) => JSON.parse(row.payload_json) as BountyRecord);
    const filtered = options.status
      ? records.filter((record) => record.status === options.status)
      : records;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    return filtered.slice(0, limit);
  }

  saveBid(record: BountyBidRecord): BountyBidRecord {
    this.db
      .prepare(
        [
          'insert into bounty_bid_records (bid_id, bounty_id, updated_at, payload_json)',
          'values (?, ?, ?, ?)',
          'on conflict(bid_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      )
      .run(record.id, record.bountyId, record.updatedAt, JSON.stringify(record));
    return record;
  }

  getBid(id: string): BountyBidRecord | undefined {
    return this.readOne('select payload_json from bounty_bid_records where bid_id = ?', id);
  }

  listBidsForBounty(bountyId: string): BountyBidRecord[] {
    const rows = this.db
      .prepare(
        'select payload_json from bounty_bid_records where bounty_id = ? order by updated_at asc'
      )
      .all(bountyId) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyBidRecord);
  }

  saveAward(record: BountyAwardRecord): BountyAwardRecord {
    this.db
      .prepare(
        [
          'insert into bounty_award_records (award_id, bounty_id, updated_at, payload_json)',
          'values (?, ?, ?, ?)',
          'on conflict(award_id) do update set',
          '  updated_at = excluded.updated_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      )
      .run(record.id, record.bountyId, record.updatedAt, JSON.stringify(record));
    return record;
  }

  getAward(id: string): BountyAwardRecord | undefined {
    return this.readOne('select payload_json from bounty_award_records where award_id = ?', id);
  }

  listAwardsForBounty(bountyId: string): BountyAwardRecord[] {
    const rows = this.db
      .prepare(
        'select payload_json from bounty_award_records where bounty_id = ? order by updated_at asc'
      )
      .all(bountyId) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyAwardRecord);
  }

  appendEvent(record: BountyEventRecord): BountyEventRecord {
    this.db
      .prepare(
        [
          'insert into bounty_event_records (event_id, bounty_id, created_at, payload_json)',
          'values (?, ?, ?, ?)',
        ].join(' ')
      )
      .run(record.id, record.bountyId, record.createdAt, JSON.stringify(record));
    return record;
  }

  listEventsForBounty(bountyId: string): BountyEventRecord[] {
    const rows = this.db
      .prepare(
        'select payload_json from bounty_event_records where bounty_id = ? order by created_at asc'
      )
      .all(bountyId) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyEventRecord);
  }

  listOpenBountiesPastDeadline(nowIso: string): BountyRecord[] {
    const now = Date.parse(nowIso);
    return this.listBounties({ limit: 200 }).filter((bounty) => {
      const biddingDeadline = Date.parse(bounty.deadlines.biddingDeadlineAt);
      const awardDeadline = Date.parse(bounty.deadlines.awardDeadlineAt);
      if (bounty.status === 'open' && Number.isFinite(biddingDeadline) && now >= biddingDeadline) {
        return true;
      }
      if (
        (bounty.status === 'open' || bounty.status === 'funded') &&
        Number.isFinite(awardDeadline) &&
        now >= awardDeadline
      ) {
        return true;
      }
      return false;
    });
  }

  listDeliveredAwardsPastAcceptDeadline(nowIso: string): BountyAwardRecord[] {
    const now = Date.parse(nowIso);
    const awards: BountyAwardRecord[] = [];
    for (const bounty of this.listBounties({ limit: 200 })) {
      const acceptDeadline = Date.parse(bounty.deadlines.acceptDeadlineAt);
      if (!Number.isFinite(acceptDeadline) || now < acceptDeadline) {
        continue;
      }
      for (const award of this.listAwardsForBounty(bounty.id)) {
        if (award.status === 'delivered') {
          awards.push(award);
        }
      }
    }
    return awards;
  }

  private readOne<T>(sql: string, id: string): T | undefined {
    const row = this.db.prepare(sql).get(id) as Row | undefined;
    if (!row?.payload_json) {
      return undefined;
    }
    return JSON.parse(row.payload_json) as T;
  }
}
