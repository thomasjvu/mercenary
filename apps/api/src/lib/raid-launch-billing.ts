import { type FastifyRequest } from 'fastify';
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

export function scheduleRaidLaunchBillingCapture(input: {
  deps: RaidLaunchBillingDeps;
  request: FastifyRequest;
  raidRequest: BossRaidSpawnInput;
  raidId: string;
  launchPayment: LaunchPaymentContext;
}): void {
  if (!input.launchPayment.apiKeyBilling) {
    return;
  }

  void captureRaidLaunchBilling(input).catch((error: unknown) => {
    logger.error(
      {
        raidId: input.raidId,
        error: error instanceof Error ? error.message : String(error),
      },
      'raid launch API-key billing capture failed'
    );
  });
}

async function captureRaidLaunchBilling(input: {
  deps: RaidLaunchBillingDeps;
  request: FastifyRequest;
  raidRequest: BossRaidSpawnInput;
  raidId: string;
  launchPayment: LaunchPaymentContext;
}): Promise<void> {
  const { ctx, auth, payment } = input.deps;
  const {
    captureApiKeyBilling,
    recordMarketplaceLedgersFromRaid,
    reconcileLaunchPayment,
    releaseLaunchPaymentHold,
  } = payment;

  try {
    const outcome = await waitForTerminalRaidOutput(
      ctx.orchestrator,
      input.raidId,
      Math.max(input.raidRequest.constraints.maxLatencySec * 1000, TIMEOUTS.MIN_TIMEOUT_MS),
      ctx.chatTerminalSettleGraceMs,
      ctx.settlementMode
    );
    const publicAuth = auth.readPublicAuth(input.request.headers);
    const capturedCostUsd = resolveApiKeyCaptureCostUsd({
      apiKeyBilling: input.launchPayment.apiKeyBilling,
      escrowFundingUsd: input.launchPayment.escrowFundingUsd,
      successfulProvidersPaid: outcome.result.settlement?.successfulProvidersPaid,
      maxBudgetUsd: input.raidRequest.constraints.maxBudgetUsd,
    });
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

    await releaseLaunchPaymentHold({ launchPayment: input.launchPayment });
    throw error;
  }
}
