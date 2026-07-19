import { type FastifyRequest } from 'fastify';
import { ApiContractError } from '@bossraid/api-contracts';
import logger from '@bossraid/logger';
import { TIMEOUTS } from '@bossraid/constants';
import type { BossRaidSpawnInput } from '@bossraid/shared-types';
import type { ApiContext } from '../api-context.js';
import type { createAuthHandlers } from '../handlers/auth.js';
import type { createPaymentHandlers, LaunchPaymentContext } from '../handlers/payment.js';
import { resolveApiKeyCaptureCostUsd } from './launch-payment-billing.js';
import { ChatTerminalWaitError, waitForTerminalRaidOutput } from './chat-terminal-wait.js';

type RaidLaunchBillingDeps = {
  ctx: ApiContext;
  auth: ReturnType<typeof createAuthHandlers>;
  payment: ReturnType<typeof createPaymentHandlers>;
};

function launchPaymentNeedsBillingCapture(launchPayment: LaunchPaymentContext): boolean {
  return Boolean(
    launchPayment.apiKeyBilling || launchPayment.manaBilling || launchPayment.settlement?.success
  );
}

export function scheduleRaidLaunchBillingCapture(input: {
  deps: RaidLaunchBillingDeps;
  request: FastifyRequest;
  raidRequest: BossRaidSpawnInput;
  raidId: string;
  launchPayment: LaunchPaymentContext;
}): void {
  // API-key holds, mana reservations, and settled x402 all need terminal capture / refund.
  if (!launchPaymentNeedsBillingCapture(input.launchPayment)) {
    return;
  }

  void captureRaidLaunchBilling(input).catch((error: unknown) => {
    logger.error(
      {
        raidId: input.raidId,
        error: error instanceof Error ? error.message : String(error),
      },
      'raid launch billing capture failed'
    );
  });
}

export async function captureRaidLaunchBilling(input: {
  deps: RaidLaunchBillingDeps;
  request: FastifyRequest;
  raidRequest: BossRaidSpawnInput;
  raidId: string;
  launchPayment: LaunchPaymentContext;
}): Promise<void> {
  const { ctx, auth, payment } = input.deps;
  const { captureApiKeyBilling, recordMarketplaceLedgersFromRaid, reconcileLaunchPayment } =
    payment;

  try {
    const outcome = await waitForTerminalRaidOutput(
      ctx.orchestrator,
      input.raidId,
      Math.max(input.raidRequest.constraints.maxLatencySec * 1000, TIMEOUTS.MIN_TIMEOUT_MS),
      ctx.chatTerminalSettleGraceMs,
      ctx.settlementMode
    );

    // Abort / cancel: full refund of launch hold and x402 when present.
    if (outcome.status.status === 'cancelled') {
      await reconcileLaunchPayment({
        route: 'raid',
        request: input.request,
        raidRequest: input.raidRequest,
        launchPayment: input.launchPayment,
        reason: 'raid_aborted',
        raidId: input.raidId,
      });
      return;
    }

    const successfulProvidersPaid = outcome.result.settlement?.successfulProvidersPaid;
    const capturedCostUsd = resolveApiKeyCaptureCostUsd({
      apiKeyBilling: input.launchPayment.apiKeyBilling,
      escrowFundingUsd: input.launchPayment.escrowFundingUsd,
      successfulProvidersPaid,
      maxBudgetUsd: input.raidRequest.constraints.maxBudgetUsd,
    });

    // Zero successful work: release API-key hold and refund x402/mana — do not keep budget.
    if (
      (typeof successfulProvidersPaid === 'number' && successfulProvidersPaid <= 0) ||
      (input.launchPayment.apiKeyBilling && capturedCostUsd <= 0)
    ) {
      await reconcileLaunchPayment({
        route: 'raid',
        request: input.request,
        raidRequest: input.raidRequest,
        launchPayment: input.launchPayment,
        reason: 'zero_success_refund',
        raidId: input.raidId,
      });
      return;
    }

    // x402 already settled at payTo; only book seller ledger (no second buyer debit).
    if (!input.launchPayment.apiKeyBilling) {
      if (capturedCostUsd > 0 || (successfulProvidersPaid ?? 0) > 0) {
        const publicAuth = auth.readPublicAuth(input.request.headers);
        recordMarketplaceLedgersFromRaid({
          raidId: input.raidId,
          route: 'raid',
          buyerWallet: publicAuth?.wallet,
          costUsd: successfulProvidersPaid ?? capturedCostUsd,
          skipBuyerPurchase: true,
        });
      }
      return;
    }

    const publicAuth = auth.readPublicAuth(input.request.headers);
    const selectedSeller =
      outcome.result.synthesizedOutput?.baseSubmissionProviderId ??
      outcome.result.approvedSubmissions?.[0]?.submission.providerId;

    captureApiKeyBilling({
      apiKeyBilling: input.launchPayment.apiKeyBilling,
      actualCostUsd: capturedCostUsd,
      route: 'raid',
      raidId: input.raidId,
      sellerId: selectedSeller,
    });
    recordMarketplaceLedgersFromRaid({
      raidId: input.raidId,
      route: 'raid',
      buyerWallet: publicAuth?.wallet,
      apiKeyId: publicAuth?.type === 'api_key' ? publicAuth.apiKeyId : undefined,
      costUsd: capturedCostUsd,
      skipBuyerPurchase: true,
    });
  } catch (error) {
    if (error instanceof ChatTerminalWaitError) {
      await reconcileLaunchPayment({
        route: 'raid',
        request: input.request,
        raidRequest: input.raidRequest,
        launchPayment: input.launchPayment,
        reason: 'terminal_wait_timeout',
        raidId: input.raidId,
      });
      return;
    }

    const billingHoldReleased =
      error instanceof ApiContractError && error.message.includes('launch hold released');
    if (!billingHoldReleased) {
      logger.error(
        {
          raidId: input.raidId,
          error: error instanceof Error ? error.message : String(error),
        },
        'raid launch billing capture failed after finalize'
      );
    }
    throw error;
  }
}
