import { randomUUID } from 'node:crypto';
import { asSingleHeader } from '@bossraid/shared-types';
import logger from '@bossraid/logger';
import type { ApiContext } from '../api-context.js';
import type { X402ReconciliationEntry } from '../control-state/types.js';
import { readX402ConfigForContext } from './x402-runtime.js';
import { refundPayment } from '../x402-verify.js';
import type { X402PaymentRequired, X402RouteName } from '../x402.js';

const MAX_ATTEMPTS = 12;
const RETRY_INTERVAL_MS = 30_000;

export type X402RefundRequest = {
  kind: X402ReconciliationEntry['kind'];
  route: X402RouteName;
  reason: string;
  paymentSignature: string;
  paymentRequired: X402PaymentRequired;
  bountyId?: string;
  raidId?: string;
  reservationId?: string;
  settlementTx?: string;
};

export async function attemptX402Refund(
  ctx: ApiContext,
  input: X402RefundRequest
): Promise<{ refunded: boolean; reconciliationId?: string; error?: string }> {
  const x402Config = readX402ConfigForContext(ctx);
  if (!x402Config.enabled || !x402Config.facilitatorUrl) {
    return { refunded: false, error: 'x402_disabled' };
  }

  try {
    await refundPayment(x402Config, input.paymentSignature, input.paymentRequired, input.reason);
    ctx.apiMetrics.increment(
      input.kind === 'bounty_fund_refund' ? 'x402.bounty_refunded' : 'x402.spawn_refunded'
    );
    return { refunded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reconciliation = enqueueX402Reconciliation(ctx, {
      ...input,
      lastError: message,
    });
    ctx.apiMetrics.increment('x402.reconciliation_queued');
    logger.error(
      {
        kind: input.kind,
        route: input.route,
        bountyId: input.bountyId,
        raidId: input.raidId,
        reconciliationId: reconciliation.id,
        error: message,
      },
      'x402 refund failed; queued for retry'
    );
    return { refunded: false, reconciliationId: reconciliation.id, error: message };
  }
}

export function enqueueX402Reconciliation(
  ctx: ApiContext,
  input: X402RefundRequest & { lastError?: string }
): X402ReconciliationEntry {
  const now = new Date().toISOString();
  const entry: X402ReconciliationEntry = {
    id: `x402rec_${randomUUID().replace(/-/g, '')}`,
    kind: input.kind,
    status: 'pending',
    reason: input.reason,
    route: input.route,
    paymentSignature: input.paymentSignature,
    paymentRequiredJson: JSON.stringify(input.paymentRequired),
    bountyId: input.bountyId,
    raidId: input.raidId,
    reservationId: input.reservationId,
    settlementTx: input.settlementTx,
    attempts: 0,
    lastError: input.lastError,
    createdAt: now,
    updatedAt: now,
  };
  return ctx.controlState.upsertX402Reconciliation(entry);
}

export async function processX402ReconciliationQueue(ctx: ApiContext): Promise<number> {
  const pending = ctx.controlState.listPendingX402Reconciliations();
  if (pending.length === 0) {
    return 0;
  }

  const x402Config = readX402ConfigForContext(ctx);
  if (!x402Config.enabled || !x402Config.facilitatorUrl) {
    return 0;
  }

  let completed = 0;
  for (const entry of pending) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      ctx.controlState.upsertX402Reconciliation({
        ...entry,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      });
      ctx.apiMetrics.increment('x402.reconciliation_exhausted');
      continue;
    }

    try {
      const paymentRequired = JSON.parse(entry.paymentRequiredJson) as X402PaymentRequired;
      await refundPayment(x402Config, entry.paymentSignature, paymentRequired, entry.reason);
      ctx.controlState.upsertX402Reconciliation({
        ...entry,
        status: 'completed',
        attempts: entry.attempts + 1,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      });
      ctx.apiMetrics.increment('x402.reconciliation_completed');
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.controlState.upsertX402Reconciliation({
        ...entry,
        attempts: entry.attempts + 1,
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      ctx.apiMetrics.increment('x402.reconciliation_retry_failed');
    }
  }

  return completed;
}

export function startX402ReconciliationWorker(ctx: ApiContext): void {
  const intervalMs = Number(
    ctx.env.BOSSRAID_X402_RECONCILIATION_INTERVAL_MS ?? String(RETRY_INTERVAL_MS)
  );
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  setInterval(() => {
    void processX402ReconciliationQueue(ctx).catch((error: unknown) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'x402 reconciliation worker failed'
      );
    });
  }, intervalMs).unref?.();
}

export function readPaymentSignature(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  return asSingleHeader(headers['payment-signature']);
}
