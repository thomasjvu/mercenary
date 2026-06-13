import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { InferenceAttestationReceipt } from '@bossraid/shared-types';

export class InferenceReceiptStore {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      [
        'create table if not exists inference_attestation_receipts (',
        '  receipt_id text primary key,',
        '  completed_at text not null,',
        '  payload_json text not null',
        ');',
      ].join(' ')
    );
  }

  save(receipt: InferenceAttestationReceipt): InferenceAttestationReceipt {
    this.db
      .prepare(
        [
          'insert into inference_attestation_receipts (receipt_id, completed_at, payload_json)',
          'values (?, ?, ?)',
          'on conflict(receipt_id) do update set',
          '  completed_at = excluded.completed_at,',
          '  payload_json = excluded.payload_json',
        ].join(' ')
      )
      .run(receipt.receiptId, receipt.completedAt, JSON.stringify(receipt));
    return receipt;
  }

  get(receiptId: string): InferenceAttestationReceipt | undefined {
    const row = this.db
      .prepare('select payload_json from inference_attestation_receipts where receipt_id = ?')
      .get(receiptId) as { payload_json?: string } | undefined;
    if (!row?.payload_json) {
      return undefined;
    }
    return JSON.parse(row.payload_json) as InferenceAttestationReceipt;
  }

  createId(): string {
    return `rcpt_${randomUUID()}`;
  }
}
