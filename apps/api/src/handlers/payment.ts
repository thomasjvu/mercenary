import { type FastifyRequest } from 'fastify';
import { ApiContractError } from '@bossraid/api-contracts';
import logger from '@bossraid/logger';
import { InvalidRaidLaunchReservationError } from '@bossraid/orchestrator';
import { asSingleHeader, type BossRaidSpawnInput } from '@bossraid/shared-types';
import {
  buildPaymentRequiredForRoute,
  readX402ReservationId,
  requireX402Payment,
  type X402SettlementResponse,
} from '../x402.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import { buildLaunchRequestKey } from '../lib/http.js';
import { computeSavingsUsd, estimateBenchmarkPriceUsd } from '../marketplace-benchmark.js';
import { refundPayment } from '../x402-verify.js';
import { type ApiContext } from '../api-context.js';
import { createManaBillingHandlers, type ManaBillingContext } from './billing-mana.js';
import { createAuthHandlers } from './auth.js';

export interface ApiKeyBillingContext {
  apiKeyId: string;
  wallet: string;
  reservedUsd: number;
  useBalance: boolean;
}

export interface LaunchPaymentContext {
  settlement?: X402SettlementResponse;
  reservationId?: string;
  requestKey?: string;
  escrowFundingUsd?: number;
  platformMarkupUsd?: number;
  manaBilling?: ManaBillingContext;
  apiKeyBilling?: ApiKeyBillingContext;
}

function getLaunchReservationPaymentTimeoutSeconds(reservation: {
  createdAt: string;
  expiresAt: string;
  paymentTimeoutSeconds?: number;
}): number {
  if (
    typeof reservation.paymentTimeoutSeconds === 'number' &&
    Number.isFinite(reservation.paymentTimeoutSeconds)
  ) {
    return Math.max(1, Math.round(reservation.paymentTimeoutSeconds));
  }

  const derivedTimeoutSeconds = Math.ceil(
    (Date.parse(reservation.expiresAt) - Date.parse(reservation.createdAt)) / 1000
  );
  return Math.max(1, Number.isFinite(derivedTimeoutSeconds) ? derivedTimeoutSeconds : 1);
}

export function createPaymentHandlers(
  ctx: ApiContext,
  auth: ReturnType<typeof createAuthHandlers>,
  manaBilling: ReturnType<typeof createManaBillingHandlers>
) {
  const { readBuyerApiKey } = auth;
  const { readManaBillingHeaders, reserveManaBilling, refundManaBilling } = manaBilling;

  function recordMarketplaceLedgersFromRaid(input: {
    raidId: string;
    route: 'raid' | 'chat' | 'inference';
    buyerWallet?: string;
    apiKeyId?: string;
    modelId?: string;
    costUsd?: number;
    skipBuyerPurchase?: boolean;
  }): void {
    const result = ctx.orchestrator.getResult(input.raidId);
    const costUsd =
      input.costUsd ??
      result.settlement?.successfulProvidersPaid ??
      result.settlement?.escrowFundingUsd ??
      0;
    if (!input.skipBuyerPurchase && input.buyerWallet && costUsd > 0) {
      const benchmarkPriceUsd = estimateBenchmarkPriceUsd({
        modelId: input.modelId,
        flatTaskUsd: costUsd,
      });
      ctx.controlState.recordBuyerPurchase({
        wallet: input.buyerWallet,
        apiKeyId: input.apiKeyId,
        raidId: input.raidId,
        modelId: input.modelId,
        sellerId:
          result.synthesizedOutput?.baseSubmissionProviderId ??
          result.approvedSubmissions?.[0]?.submission.providerId,
        costUsd,
        benchmarkPriceUsd,
        savingsUsd: computeSavingsUsd(benchmarkPriceUsd, costUsd),
        route: input.route,
      });
    }

    const payout = result.settlement?.payoutPerSuccessfulProvider ?? 0;
    const successfulProviderIds =
      result.settlementExecution?.successfulProviderIds ??
      result.approvedSubmissions?.map((entry) => entry.submission.providerId) ??
      [];
    for (const providerId of successfulProviderIds) {
      if (payout <= 0) {
        continue;
      }
      const txHash =
        result.settlementExecution?.childJobs?.find((job) => job.providerId === providerId)
          ?.fundTxHash ?? result.settlementExecution?.finalizeTxHash;
      ctx.controlState.recordSellerPayout({
        providerId,
        raidId: input.raidId,
        grossUsd: payout,
        status: result.status,
        txHash,
      });
    }
  }

  function captureApiKeyBilling(input: {
    apiKeyBilling?: ApiKeyBillingContext;
    actualCostUsd: number;
    route: 'raid' | 'chat' | 'inference';
    raidId: string;
    modelId?: string;
    sellerId?: string;
  }): void {
    if (!input.apiKeyBilling || input.actualCostUsd <= 0) {
      return;
    }
    ctx.controlState.recordBuyerApiKeyUsage(input.apiKeyBilling.apiKeyId, input.actualCostUsd);
    if (input.apiKeyBilling.useBalance) {
      ctx.controlState.debitBuyerBalance(input.apiKeyBilling.wallet, input.actualCostUsd);
    }
    const benchmarkPriceUsd = estimateBenchmarkPriceUsd({
      modelId: input.modelId,
      flatTaskUsd: input.actualCostUsd,
    });
    ctx.controlState.recordBuyerPurchase({
      wallet: input.apiKeyBilling.wallet,
      apiKeyId: input.apiKeyBilling.apiKeyId,
      raidId: input.raidId,
      modelId: input.modelId,
      sellerId: input.sellerId,
      costUsd: input.actualCostUsd,
      benchmarkPriceUsd,
      savingsUsd: computeSavingsUsd(benchmarkPriceUsd, input.actualCostUsd),
      route: input.route,
    });
  }

  async function reconcileLaunchPayment(input: {
    route: 'raid' | 'chat' | 'inference';
    request: FastifyRequest;
    raidRequest: BossRaidSpawnInput;
    launchPayment: LaunchPaymentContext;
    reason: string;
    raidId?: string;
  }): Promise<void> {
    await refundManaBilling({
      manaBilling: input.launchPayment.manaBilling,
      reason: input.reason,
      raidId: input.raidId,
    });

    if (!input.launchPayment.settlement?.success) {
      return;
    }

    ctx.apiMetrics.increment('x402.spawn_reconciliation');
    const signatureHeader = asSingleHeader(input.request.headers['payment-signature']);
    if (!signatureHeader || !input.launchPayment.reservationId || !input.launchPayment.requestKey) {
      ctx.apiMetrics.increment('x402.spawn_reconciliation_failed');
      logger.error(
        {
          reason: input.reason,
          reservationId: input.launchPayment.reservationId,
          route: input.route,
        },
        'x402 spawn failure missing payment context for refund'
      );
      return;
    }

    const reservation = ctx.orchestrator.getRaidLaunchReservation(
      input.launchPayment.reservationId,
      input.launchPayment.requestKey
    );
    if (!reservation) {
      ctx.apiMetrics.increment('x402.spawn_reconciliation_failed');
      logger.error(
        {
          reason: input.reason,
          reservationId: input.launchPayment.reservationId,
          route: input.route,
        },
        'x402 spawn failure could not reload launch reservation for refund'
      );
      return;
    }

    const x402Config = readX402ConfigForContext(ctx);
    const paymentRequired = buildPaymentRequiredForRoute(
      x402Config,
      input.route,
      reservation.sanitized.constraints.maxBudgetUsd,
      {
        extra: {
          reservationId: reservation.id,
        },
        maxTimeoutSeconds: getLaunchReservationPaymentTimeoutSeconds(reservation),
      }
    );

    try {
      await refundPayment(x402Config, signatureHeader, paymentRequired, input.reason);
      ctx.apiMetrics.increment('x402.spawn_refunded');
    } catch (error) {
      ctx.apiMetrics.increment('x402.spawn_reconciliation_failed');
      logger.error(error, 'x402 spawn failure refund failed');
    }
  }

  async function requireReservedLaunchPayment(
    route: 'raid' | 'chat' | 'inference',
    request: FastifyRequest,
    input: BossRaidSpawnInput
  ): Promise<LaunchPaymentContext> {
    const manaBillingHeaders = readManaBillingHeaders(request.headers);
    const requestKey = buildLaunchRequestKey(request, route, input);
    if (manaBillingHeaders) {
      const reservation = await ctx.orchestrator.reserveRaidLaunch(input, {
        route,
        requestKey,
        holdUntilUnix: Math.floor(Date.now() / 1_000) + 60,
      });
      const amount =
        reservation.quoteSnapshot?.manaQuote.maxChargeMana ??
        Math.ceil(reservation.sanitized.constraints.maxBudgetUsd * 1_000);
      const reservedManaBilling = await reserveManaBilling({
        route,
        manaAccountId: manaBillingHeaders.manaAccountId,
        amount,
        requestKey,
        quoteSnapshot: reservation.quoteSnapshot,
      });
      return {
        reservationId: reservation.id,
        requestKey,
        manaBilling: reservedManaBilling,
      };
    }

    const apiKey = readBuyerApiKey(request.headers);
    if (apiKey) {
      const reservation = await ctx.orchestrator.reserveRaidLaunch(input, {
        route,
        requestKey,
        holdUntilUnix: Math.floor(Date.now() / 1_000) + 60,
      });
      const amountUsd = reservation.sanitized.constraints.maxBudgetUsd;
      const account = ctx.controlState.readPublicAccount(apiKey.wallet);
      const spendCapOk =
        apiKey.spendLimitUsd == null || apiKey.spentUsd + amountUsd <= apiKey.spendLimitUsd;
      const balanceOk = (account?.balanceUsd ?? 0) >= amountUsd;
      if (!spendCapOk && !balanceOk) {
        throw new ApiContractError(
          'Insufficient API key spend limit or prepaid balance for this request.',
          402
        );
      }
      return {
        reservationId: reservation.id,
        requestKey,
        escrowFundingUsd: amountUsd,
        apiKeyBilling: {
          apiKeyId: apiKey.id,
          wallet: apiKey.wallet,
          reservedUsd: amountUsd,
          useBalance: balanceOk,
        },
      };
    }

    const x402Config = readX402ConfigForContext(ctx);
    if (!x402Config.enabled) {
      return {};
    }

    const paymentSignature = asSingleHeader(request.headers['payment-signature']);
    const explicitReservationId = readX402ReservationId(request.headers);
    if (paymentSignature && !explicitReservationId) {
      throw new ApiContractError(
        'Paid requests must include X-BossRaid-Launch-Reservation from the payment challenge.'
      );
    }

    const reservation =
      explicitReservationId == null
        ? await ctx.orchestrator.reserveRaidLaunch(input, {
            route,
            requestKey,
            holdUntilUnix: Math.floor(Date.now() / 1_000) + x402Config.maxTimeoutSeconds,
          })
        : ctx.orchestrator.getRaidLaunchReservation(explicitReservationId, requestKey);

    if (!reservation) {
      throw new InvalidRaidLaunchReservationError(
        'Raid launch reservation is missing, expired, or does not match this request.'
      );
    }
    if (reservation.route !== route) {
      throw new InvalidRaidLaunchReservationError(
        `Raid launch reservation ${reservation.id} was created for /v1/${reservation.route}, not ${route}.`
      );
    }

    const paymentRequired = buildPaymentRequiredForRoute(
      x402Config,
      route,
      reservation.sanitized.constraints.maxBudgetUsd,
      {
        extra: {
          reservationId: reservation.id,
        },
        maxTimeoutSeconds: getLaunchReservationPaymentTimeoutSeconds(reservation),
      }
    );

    const payment = await requireX402Payment({
      route,
      headers: request.headers,
      config: x402Config,
      budgetUsd: reservation.sanitized.constraints.maxBudgetUsd,
      paymentRequired,
    });

    reservation.escrowFundingUsd = payment.escrowFundingUsd;
    reservation.platformMarkupUsd = payment.platformMarkupUsd;
    reservation.x402PaidAmountUsd = payment.paidAmountUsd;

    return {
      settlement: payment.settlement,
      reservationId: reservation.id,
      requestKey,
      escrowFundingUsd: payment.escrowFundingUsd,
      platformMarkupUsd: payment.platformMarkupUsd,
    };
  }

  return {
    recordMarketplaceLedgersFromRaid,
    captureApiKeyBilling,
    requireReservedLaunchPayment,
    reconcileLaunchPayment,
  };
}
