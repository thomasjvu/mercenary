import type { BountyRecord } from '@bossraid/shared-types';
import logger from '@bossraid/logger';
import type { ApiContext } from '../api-context.js';
import {
  type BountyOnchainExecutor,
  isBountyOnchainConfigured,
  mapBountyOnchainError,
  requiresProductionBountyEscrow,
} from './bounty-onchain.js';
import {
  allowUnverifiedFundInDev,
  applyVerifiedFundSettlementHeaders,
  collectVerifiedFundPayment,
} from './verified-fund-payment.js';
import { readX402ConfigForContext } from './x402-runtime.js';
import { attemptX402Refund, readPaymentSignature } from './x402-reconciliation.js';
import { buildX402SettlementFingerprint } from '../control-state/x402-settled-payments.js';
import { buildPaymentRequiredForRoute } from '../x402.js';

export type BountyFundBody = {
  escrowReceiptJson?: string;
  escrowJobId?: string;
  openNow: boolean;
};

export type PreparedBountyFund = {
  escrowReceiptJson?: string;
  escrowJobId?: string;
};

export function parseBountyFundBody(body: Record<string, unknown>): BountyFundBody {
  return {
    escrowReceiptJson:
      typeof body.escrowReceiptJson === 'string'
        ? body.escrowReceiptJson
        : typeof body.escrow_receipt_json === 'string'
          ? body.escrow_receipt_json
          : undefined,
    escrowJobId:
      typeof body.escrowJobId === 'string'
        ? body.escrowJobId
        : typeof body.escrow_job_id === 'string'
          ? body.escrow_job_id
          : undefined,
    openNow: body.openNow !== false && body.open_now !== false,
  };
}

export function assertBountyFundEscrowReady(
  env: NodeJS.ProcessEnv,
  onchainExecutor: BountyOnchainExecutor | undefined
): { ok: true } | { ok: false; statusCode: number; body: Record<string, unknown> } {
  const mustEscrowOnchain = requiresProductionBountyEscrow(env) || isBountyOnchainConfigured(env);
  if (mustEscrowOnchain && !onchainExecutor) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        error: 'bounty_escrow_unconfigured',
        message:
          'Onchain bounty escrow is required but BOSSRAID_BOUNTY_ESCROW_ADDRESS, token, RPC, and client signer are not fully configured.',
      },
    };
  }
  return { ok: true };
}

export async function preflightBountyFundOnchain(
  onchainExecutor: BountyOnchainExecutor | undefined,
  draft: BountyRecord
): Promise<{ ok: true } | { ok: false; statusCode: number; body: Record<string, unknown> }> {
  if (!onchainExecutor) {
    return { ok: true };
  }
  try {
    await onchainExecutor.preflightFundBounty(draft);
    return { ok: true };
  } catch (error) {
    const mapped = mapBountyOnchainError(error);
    return {
      ok: false,
      statusCode: mapped.code === 'insufficient_operator_balance' ? 503 : 502,
      body: { error: mapped.code, message: mapped.message },
    };
  }
}

export function paymentsDisabledForBountyFund(
  ctx: ApiContext
): { ok: true } | { ok: false; statusCode: number; body: Record<string, unknown> } {
  const x402Config = readX402ConfigForContext(ctx);
  if (x402Config.enabled) {
    return { ok: true };
  }
  if (allowUnverifiedFundInDev(ctx.env, 'BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND')) {
    return { ok: true };
  }
  const isProduction = ctx.env.NODE_ENV === 'production';
  return {
    ok: false,
    statusCode: 503,
    body: {
      error: 'payments_disabled',
      message: isProduction
        ? 'Bounty funding requires x402 USDC payments in production.'
        : 'Enable BOSSRAID_X402_ENABLED or BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND for local development.',
    },
  };
}

/**
 * When x402 is off but onchain escrow is configured (testnet dogfood), still lock funds
 * via operator createAndFundBounty. Production must use x402 (ALLOW_UNVERIFIED blocked there).
 */
export async function prepareUnverifiedOnchainBountyFund(input: {
  ctx: ApiContext;
  bountyId: string;
  posterWallet: string;
  draft: BountyRecord;
  onchainExecutor: BountyOnchainExecutor | undefined;
}): Promise<
  | { ok: true; prepared: PreparedBountyFund }
  | { ok: false; statusCode: number; body: Record<string, unknown> }
> {
  if (!input.onchainExecutor) {
    return { ok: true, prepared: {} };
  }
  if (!allowUnverifiedFundInDev(input.ctx.env, 'BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND')) {
    return { ok: true, prepared: {} };
  }
  if (input.draft.escrowJobId) {
    return {
      ok: false,
      statusCode: 409,
      body: { error: 'already_funded', message: 'Bounty escrow is already funded.' },
    };
  }
  try {
    const onchain = await input.onchainExecutor.createAndFundBounty({
      posterWallet: input.posterWallet,
      bounty: input.draft,
    });
    return {
      ok: true,
      prepared: {
        escrowJobId: onchain.onchainBountyId,
        escrowReceiptJson: JSON.stringify({
          route: 'bounty',
          mode: 'unverified_onchain',
          onchain: {
            bountyId: onchain.onchainBountyId,
            fundTxHash: onchain.fundTxHash,
          },
        }),
      },
    };
  } catch (error) {
    logger.error(
      {
        bountyId: input.bountyId,
        error: error instanceof Error ? error.message : String(error),
      },
      'bounty unverified onchain fund failed'
    );
    const mapped = mapBountyOnchainError(error);
    return {
      ok: false,
      statusCode: mapped.code === 'insufficient_operator_balance' ? 503 : 502,
      body: { error: mapped.code, message: mapped.message },
    };
  }
}

export async function prepareBountyFundPayment(input: {
  ctx: ApiContext;
  bountyId: string;
  posterWallet: string;
  draft: BountyRecord;
  headers: Record<string, string | string[] | undefined>;
  onchainExecutor: BountyOnchainExecutor | undefined;
  reply: { header: (name: string, value: string) => void; code: (status: number) => void };
}): Promise<
  | { ok: true; prepared: PreparedBountyFund }
  | { ok: false; statusCode: number; body: Record<string, unknown> }
> {
  const x402Config = readX402ConfigForContext(input.ctx);
  if (!x402Config.enabled) {
    return prepareUnverifiedOnchainBountyFund({
      ctx: input.ctx,
      bountyId: input.bountyId,
      posterWallet: input.posterWallet,
      draft: input.draft,
      onchainExecutor: input.onchainExecutor,
    });
  }

  if (input.draft.escrowJobId) {
    return {
      ok: false,
      statusCode: 409,
      body: {
        error: 'already_funded',
        message: 'Bounty escrow is already funded.',
      },
    };
  }

  const payment = await collectVerifiedFundPayment({
    ctx: input.ctx,
    route: 'bounty',
    budgetUsd: input.draft.rewardAmountUsd,
    headers: input.headers,
    paymentRequiredExtra: { bountyId: input.bountyId },
  });
  applyVerifiedFundSettlementHeaders(input.reply, payment.settlement);

  const fingerprint = buildX402SettlementFingerprint({
    settlementTx: payment.settlement?.transaction,
    paymentSignature: readPaymentSignature(input.headers),
  });
  if (payment.settlement?.payer && payment.settlement.payer.toLowerCase() !== input.posterWallet) {
    // Payment already settled with facilitator — refund so payer is not stranded (mirror onchain fail path).
    const paymentSignature = readPaymentSignature(input.headers);
    const x402Config = readX402ConfigForContext(input.ctx);
    const paymentRequired =
      payment.paymentRequired ??
      buildPaymentRequiredForRoute(x402Config, 'bounty', input.draft.rewardAmountUsd, {
        extra: { bountyId: input.bountyId },
      });
    let refundStatus: { refunded: boolean; reconciliationId?: string; error?: string } = {
      refunded: false,
      error: 'missing_payment_signature',
    };
    if (paymentSignature && payment.settlement?.success) {
      refundStatus = await attemptX402Refund(input.ctx, {
        kind: 'bounty_fund_refund',
        route: 'bounty',
        reason: 'bounty_payer_mismatch',
        paymentSignature,
        paymentRequired,
        bountyId: input.bountyId,
        settlementTx: payment.settlement.transaction,
      });
    }
    return {
      ok: false,
      statusCode: 403,
      body: {
        error: 'payer_mismatch',
        message: refundStatus.refunded
          ? 'x402 payer must match the bounty poster wallet. Your payment was refunded automatically.'
          : 'x402 payer must match the bounty poster wallet. A refund has been queued for automatic retry.',
        refunded: refundStatus.refunded,
        reconciliationId: refundStatus.reconciliationId,
      },
    };
  }

  if (fingerprint && payment.settlement?.success) {
    const claimed = input.ctx.controlState.tryClaimX402SettledPayment({
      fingerprint,
      wallet: input.posterWallet.toLowerCase(),
      route: 'bounty',
      amountUsd: payment.escrowFundingUsd,
      createdAt: new Date().toISOString(),
    });
    if (!claimed) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'duplicate_payment',
          message: 'This x402 payment was already applied to a bounty fund.',
        },
      };
    }
  }

  let escrowReceiptJson = JSON.stringify({
    route: 'bounty',
    paidAmountUsd: payment.paidAmountUsd,
    escrowFundingUsd: payment.escrowFundingUsd,
    platformMarkupUsd: payment.platformMarkupUsd,
    settlement: payment.settlement,
  });
  let escrowJobId: string | undefined;

  if (input.onchainExecutor) {
    try {
      const onchain = await input.onchainExecutor.createAndFundBounty({
        posterWallet: input.posterWallet,
        bounty: input.draft,
      });
      escrowJobId = onchain.onchainBountyId;
      const receipt = JSON.parse(escrowReceiptJson) as Record<string, unknown>;
      receipt.onchain = {
        bountyId: onchain.onchainBountyId,
        fundTxHash: onchain.fundTxHash,
      };
      escrowReceiptJson = JSON.stringify(receipt);
    } catch (error) {
      logger.error(
        {
          bountyId: input.bountyId,
          settlement: payment.settlement,
          error: error instanceof Error ? error.message : String(error),
        },
        'bounty onchain fund failed after x402 settlement'
      );

      if (fingerprint) {
        input.ctx.controlState.releaseX402SettledPayment(fingerprint);
      }

      const paymentSignature = readPaymentSignature(input.headers);
      const paymentRequired =
        payment.paymentRequired ??
        buildPaymentRequiredForRoute(x402Config, 'bounty', input.draft.rewardAmountUsd, {
          extra: { bountyId: input.bountyId },
        });
      let refundStatus: { refunded: boolean; reconciliationId?: string; error?: string } = {
        refunded: false,
        error: 'missing_payment_signature',
      };
      if (paymentSignature && payment.settlement?.success) {
        refundStatus = await attemptX402Refund(input.ctx, {
          kind: 'bounty_fund_refund',
          route: 'bounty',
          reason: 'bounty_onchain_escrow_failed',
          paymentSignature,
          paymentRequired,
          bountyId: input.bountyId,
          settlementTx: payment.settlement.transaction,
        });
      }

      return {
        ok: false,
        statusCode: refundStatus.refunded ? 502 : 503,
        body: {
          error: 'escrow_fund_failed',
          message: refundStatus.refunded
            ? 'Onchain bounty escrow funding failed after payment. Your x402 payment was refunded automatically.'
            : 'Onchain bounty escrow funding failed after payment. A refund has been queued for automatic retry.',
          settlement: payment.settlement,
          refund: {
            refunded: refundStatus.refunded,
            reconciliationId: refundStatus.reconciliationId,
            error: refundStatus.error,
          },
        },
      };
    }
  } else if (requiresProductionBountyEscrow(input.ctx.env)) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        error: 'bounty_escrow_unconfigured',
        message: 'Production bounty funding requires onchain escrow.',
      },
    };
  }

  return {
    ok: true,
    prepared: { escrowReceiptJson, escrowJobId },
  };
}
