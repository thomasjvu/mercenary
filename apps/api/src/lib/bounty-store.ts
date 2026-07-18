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
        'create table if not exists bounty_funding_locks (',
        '  bounty_id text primary key,',
        '  acquired_at text not null',
        ');',
        'create table if not exists bounty_award_payment_claims (',
        '  award_id text primary key,',
        '  claimed_at text not null',
        ');',
        'create table if not exists bounty_worker_locks (',
        '  lock_name text primary key,',
        '  holder_id text not null,',
        '  acquired_at text not null',
        ');',
      ].join('\n')
    );
  }

  tryAcquireFundingLock(bountyId: string): boolean {
    try {
      this.db
        .prepare('insert into bounty_funding_locks (bounty_id, acquired_at) values (?, ?)')
        .run(bountyId, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  releaseFundingLock(bountyId: string): void {
    this.db.prepare('delete from bounty_funding_locks where bounty_id = ?').run(bountyId);
  }

  claimDeliveredAwardForPayment(awardId: string): BountyAwardRecord | undefined {
    this.db.exec('begin immediate');
    try {
      const award = this.getAward(awardId);
      if (!award || award.status !== 'delivered') {
        this.db.exec('rollback');
        return undefined;
      }

      const nowIso = new Date().toISOString();
      const paying: BountyAwardRecord = {
        ...award,
        status: 'paying',
        updatedAt: nowIso,
      };

      try {
        this.db
          .prepare('insert into bounty_award_payment_claims (award_id, claimed_at) values (?, ?)')
          .run(awardId, nowIso);
      } catch {
        // Orphan recovery: claim row exists but award still delivered (crash after insert,
        // before status update). Adopt the existing claim and finish the transition.
        const claim = this.db
          .prepare('select award_id from bounty_award_payment_claims where award_id = ?')
          .get(awardId) as { award_id?: string } | undefined;
        if (!claim?.award_id) {
          this.db.exec('rollback');
          return undefined;
        }
      }

      this.saveAward(paying);
      this.db.exec('commit');
      return paying;
    } catch {
      try {
        this.db.exec('rollback');
      } catch {
        // ignore rollback failures when transaction already closed
      }
      return undefined;
    }
  }

  releasePayingAward(awardId: string): void {
    const award = this.getAward(awardId);
    if (!award || award.status !== 'paying') {
      return;
    }
    this.db.prepare('delete from bounty_award_payment_claims where award_id = ?').run(awardId);
    this.saveAward({
      ...award,
      status: 'delivered',
      paidAt: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  tryAcquireDeadlineWorkerLock(holderId: string, staleAfterMs: number): boolean {
    const nowIso = new Date().toISOString();
    const staleBeforeIso = new Date(Date.now() - staleAfterMs).toISOString();
    this.db.exec('begin immediate');
    try {
      const row = this.db
        .prepare('select holder_id, acquired_at from bounty_worker_locks where lock_name = ?')
        .get('deadline') as { holder_id?: string; acquired_at?: string } | undefined;
      if (row?.acquired_at && row.acquired_at > staleBeforeIso) {
        this.db.exec('rollback');
        return false;
      }
      this.db
        .prepare(
          [
            'insert into bounty_worker_locks (lock_name, holder_id, acquired_at)',
            'values (?, ?, ?)',
            'on conflict(lock_name) do update set',
            '  holder_id = excluded.holder_id,',
            '  acquired_at = excluded.acquired_at',
          ].join(' ')
        )
        .run('deadline', holderId, nowIso);
      this.db.exec('commit');
      return true;
    } catch {
      this.db.exec('rollback');
      return false;
    }
  }

  releaseDeadlineWorkerLock(holderId: string): void {
    this.db
      .prepare('delete from bounty_worker_locks where lock_name = ? and holder_id = ?')
      .run('deadline', holderId);
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
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const rows = this.db
      .prepare(
        [
          'select payload_json from bounty_records',
          "where (? is null or json_extract(payload_json, '$.status') = ?)",
          'order by updated_at desc',
          'limit ?',
        ].join(' ')
      )
      .all(options.status ?? null, options.status ?? null, limit) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyRecord);
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
    const rows = this.db
      .prepare(
        [
          'select payload_json from bounty_records',
          'where (',
          "  json_extract(payload_json, '$.status') = 'open'",
          "  and json_extract(payload_json, '$.deadlines.biddingDeadlineAt') <= ?",
          ') or (',
          "  json_extract(payload_json, '$.status') in ('open', 'funded')",
          "  and json_extract(payload_json, '$.deadlines.awardDeadlineAt') <= ?",
          ')',
          'order by updated_at desc',
          'limit 200',
        ].join(' ')
      )
      .all(nowIso, nowIso) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyRecord);
  }

  listDeliveredAwardsPastAcceptDeadline(nowIso: string): BountyAwardRecord[] {
    const rows = this.db
      .prepare(
        [
          'select award.payload_json as payload_json',
          'from bounty_award_records award',
          'inner join bounty_records bounty on bounty.bounty_id = award.bounty_id',
          "where json_extract(award.payload_json, '$.status') = 'delivered'",
          "and json_extract(bounty.payload_json, '$.deadlines.acceptDeadlineAt') <= ?",
          'order by award.updated_at asc',
          'limit 200',
        ].join(' ')
      )
      .all(nowIso) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyAwardRecord);
  }

  /** Pending/in_progress awards past delivery deadline (F-7 recovery candidates). */
  listPendingAwardsPastDeliveryDeadline(nowIso: string): BountyAwardRecord[] {
    const rows = this.db
      .prepare(
        [
          'select award.payload_json as payload_json',
          'from bounty_award_records award',
          'inner join bounty_records bounty on bounty.bounty_id = award.bounty_id',
          "where json_extract(award.payload_json, '$.status') in ('pending', 'in_progress')",
          "and json_extract(bounty.payload_json, '$.deadlines.deliveryDeadlineAt') <= ?",
          'order by award.updated_at asc',
          'limit 200',
        ].join(' ')
      )
      .all(nowIso) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyAwardRecord);
  }

  /** Bounties that may still hold unallocated escrow after the award window. */
  listBountiesPastAwardDeadlineForLeftover(nowIso: string): BountyRecord[] {
    const rows = this.db
      .prepare(
        [
          'select payload_json from bounty_records',
          // Include awarded/delivered (and paid only if still escrowed — filtered in service by committedUsd).
          "where json_extract(payload_json, '$.status') in ('open', 'funded', 'awarded', 'in_progress', 'delivered', 'paid')",
          "and json_extract(payload_json, '$.status') != 'refunded'",
          "and json_extract(payload_json, '$.deadlines.awardDeadlineAt') <= ?",
          'order by updated_at desc',
          'limit 200',
        ].join(' ')
      )
      .all(nowIso) as Row[];
    return rows.map((row) => JSON.parse(row.payload_json) as BountyRecord);
  }

  private readOne<T>(sql: string, id: string): T | undefined {
    const row = this.db.prepare(sql).get(id) as Row | undefined;
    if (!row?.payload_json) {
      return undefined;
    }
    return JSON.parse(row.payload_json) as T;
  }
}
