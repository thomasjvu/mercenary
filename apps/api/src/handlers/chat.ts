import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  buildBossRaidRequestFromChatCompletion,
  parseChatCompletionRequest,
  parseBossRaidRequest,
} from '@bossraid/api-contracts';
import { TIMEOUTS } from '@bossraid/constants';
import { applyX402Headers } from '../x402.js';
import {
  forceDiscountInferenceChatPolicy,
  readTrustedAlkahestClient,
  resolveDiscountInferenceDefaultMaxTotalCost,
} from '../lib/inference-marketplace.js';
import {
  buildChatCompletionResponse,
  buildDirectChatCompletionResponse,
  streamDirectChatCompletionResponse,
  streamChatCompletionResponse,
  waitForTerminalRaidOutput,
} from '../lib/chat-completion.js';
import { enforceBuyerBudget } from '../lib/account.js';
import { type ApiContext } from '../api-context.js';
import { createAuthHandlers } from './auth.js';
import { createManaBillingHandlers } from './billing-mana.js';
import { createPaymentHandlers } from './payment.js';
import { createRaidHandlers } from './raid.js';

export function createChatHandlers(
  ctx: ApiContext,
  auth: ReturnType<typeof createAuthHandlers>,
  manaBilling: ReturnType<typeof createManaBillingHandlers>,
  payment: ReturnType<typeof createPaymentHandlers>,
  raid: ReturnType<typeof createRaidHandlers>
) {
  const { requireRateLimit, requireBuyerApiKeyRateLimit, readPublicAuth } = auth;
  const { captureManaBilling, refundManaBilling, buildBossRaidBillingMetadata } = manaBilling;
  const { requireReservedLaunchPayment, captureApiKeyBilling, recordMarketplaceLedgersFromRaid } =
    payment;
  const { ensureErc8004ProofState } = raid;

  async function handleChatCompletionRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options: {
      discountInference?: boolean;
    } = {}
  ) {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'public-action',
      ctx.publicRateLimitMax,
      ctx.publicRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const parsedChatRequest = parseChatCompletionRequest(request.body);
    const strictAlkahestLane = readTrustedAlkahestClient(request.headers) != null;
    const discountDefaultMaxTotalCost = options.discountInference
      ? resolveDiscountInferenceDefaultMaxTotalCost(
          parsedChatRequest,
          ctx.orchestrator.listProviders()
        )
      : undefined;
    const chatRequest = options.discountInference
      ? forceDiscountInferenceChatPolicy(parsedChatRequest, {
          defaultMaxTotalCost: discountDefaultMaxTotalCost,
          strictAlkahestLane,
        })
      : parsedChatRequest;
    const raidRequest =
      chatRequest.raidRequest ??
      parseBossRaidRequest(
        buildBossRaidRequestFromChatCompletion(chatRequest, {
          defaultMaxTotalCost: discountDefaultMaxTotalCost ?? ctx.chatDefaultMaxTotalCost,
        })
      );
    const publicAuth = readPublicAuth(request.headers);
    const apiKeyRateLimitError = requireBuyerApiKeyRateLimit(publicAuth, reply);
    if (apiKeyRateLimitError) {
      return apiKeyRateLimitError;
    }
    const budgetError = enforceBuyerBudget(
      ctx.controlState,
      publicAuth,
      raidRequest.constraints.maxBudgetUsd,
      ctx.buyerMaxRequestBudgetUsd
    );
    if (budgetError) {
      reply.code(budgetError.statusCode);
      return {
        error: budgetError.error,
        message: budgetError.message,
      };
    }
    const created = Math.floor(Date.now() / 1000);
    const directResponse = options.discountInference
      ? null
      : buildDirectChatCompletionResponse(chatRequest, created);

    if (directResponse) {
      if (chatRequest.stream) {
        await streamDirectChatCompletionResponse(reply, directResponse);
        return;
      }

      return directResponse;
    }

    await ensureErc8004ProofState({ includeMercenary: false });
    const paymentRoute = options.discountInference ? 'inference' : 'chat';
    const launchPayment = await requireReservedLaunchPayment(paymentRoute, request, raidRequest);
    let spawn;
    try {
      spawn =
        launchPayment.reservationId && launchPayment.requestKey
          ? await ctx.orchestrator.spawnReservedRaid(
              launchPayment.reservationId,
              launchPayment.requestKey,
              launchPayment.escrowFundingUsd,
              launchPayment.platformMarkupUsd
            )
          : await ctx.orchestrator.spawnRaid(
              raidRequest,
              launchPayment.escrowFundingUsd,
              launchPayment.platformMarkupUsd
            );
    } catch (error) {
      await refundManaBilling({ manaBilling: launchPayment.manaBilling, reason: 'spawn_failed' });
      throw error;
    }

    if (chatRequest.stream) {
      if (publicAuth?.type === 'api_key') {
        ctx.controlState.recordBuyerApiKeyUsage(
          publicAuth.apiKeyId,
          launchPayment.escrowFundingUsd ?? raidRequest.constraints.maxBudgetUsd
        );
      }
      applyX402Headers(reply, {
        settlement: launchPayment.settlement,
      });
      await streamChatCompletionResponse(reply, ctx.orchestrator, {
        chatRequest,
        raidRequest,
        spawn,
        created,
        settleGraceMs: ctx.chatTerminalSettleGraceMs,
        settlementMode: ctx.settlementMode,
        bossraidBilling: launchPayment.manaBilling
          ? {
              capture: async (usage, selectedSeller) => {
                const settlement = await captureManaBilling({
                  manaBilling: launchPayment.manaBilling,
                  usage,
                  raidId: spawn.raidId,
                  receiptPath: spawn.receiptPath,
                });
                return buildBossRaidBillingMetadata({
                  manaBilling: launchPayment.manaBilling,
                  settlement,
                  selectedSeller,
                  receiptPath: spawn.receiptPath,
                });
              },
            }
          : undefined,
      });
      return;
    }

    let outcome;
    try {
      outcome = await waitForTerminalRaidOutput(
        ctx.orchestrator,
        spawn.raidId,
        Math.max(raidRequest.constraints.maxLatencySec * 1000, TIMEOUTS.MIN_TIMEOUT_MS),
        ctx.chatTerminalSettleGraceMs,
        ctx.settlementMode
      );
    } catch (error) {
      await refundManaBilling({
        manaBilling: launchPayment.manaBilling,
        reason: 'terminal_output_failed',
        raidId: spawn.raidId,
      });
      throw error;
    }
    const response = buildChatCompletionResponse(
      chatRequest,
      spawn,
      outcome,
      created
    ) as ReturnType<typeof buildChatCompletionResponse> & { bossraid?: unknown };
    const manaSettlement = await captureManaBilling({
      manaBilling: launchPayment.manaBilling,
      usage: response.usage,
      raidId: spawn.raidId,
      receiptPath: spawn.receiptPath,
    });
    const selectedSeller =
      outcome.result.synthesizedOutput?.baseSubmissionProviderId ??
      outcome.result.approvedSubmissions?.[0]?.submission.providerId;
    const capturedCostUsd =
      launchPayment.escrowFundingUsd ??
      outcome.result.settlement?.successfulProvidersPaid ??
      raidRequest.constraints.maxBudgetUsd;
    const bossraid = buildBossRaidBillingMetadata({
      manaBilling: launchPayment.manaBilling,
      settlement: manaSettlement,
      selectedSeller,
      receiptPath: spawn.receiptPath,
      modelId: chatRequest.model,
      paidPriceUsd: capturedCostUsd,
    });
    if (bossraid) {
      response.bossraid = bossraid;
    }
    captureApiKeyBilling({
      apiKeyBilling: launchPayment.apiKeyBilling,
      actualCostUsd: capturedCostUsd,
      route: options.discountInference ? 'inference' : 'chat',
      raidId: spawn.raidId,
      modelId: chatRequest.model,
      sellerId: selectedSeller,
    });
    if (!launchPayment.apiKeyBilling && publicAuth?.type === 'api_key') {
      ctx.controlState.recordBuyerApiKeyUsage(publicAuth.apiKeyId, capturedCostUsd);
    }
    recordMarketplaceLedgersFromRaid({
      raidId: spawn.raidId,
      route: options.discountInference ? 'inference' : 'chat',
      buyerWallet: publicAuth?.wallet,
      apiKeyId: publicAuth?.type === 'api_key' ? publicAuth.apiKeyId : undefined,
      modelId: chatRequest.model,
      costUsd: capturedCostUsd,
      skipBuyerPurchase: Boolean(launchPayment.apiKeyBilling),
    });
    applyX402Headers(reply, {
      settlement: launchPayment.settlement,
    });
    return response;
  }

  return {
    handleChatCompletionRequest,
  };
}
