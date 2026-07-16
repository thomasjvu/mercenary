import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  ApiContractError,
  buildBossRaidRequestFromChatCompletion,
  parseChatCompletionRequest,
  parseBossRaidRequest,
} from '@bossraid/api-contracts';
import { TIMEOUTS } from '@bossraid/constants';
import type { BossRaidSpawnInput, ChatCompletionRequest } from '@bossraid/shared-types';
import { applyX402Headers } from '../x402.js';
import {
  forceDiscountInferenceChatPolicy,
  readTrustedAlkahestClient,
  resolveDiscountInferenceDefaultMaxTotalCost,
} from './inference-marketplace.js';
import {
  buildChatCompletionResponse,
  streamDirectChatCompletionResponse,
  streamChatCompletionResponse,
  ChatTerminalWaitError,
  waitForTerminalRaidOutput,
} from './chat-completion.js';
import { enforceBuyerBudget } from './account.js';
import { executeE2eeChatRelay } from './e2ee-chat-relay.js';
import {
  applyMercenaryPlannerOverrides,
  buildPlannerDirectChatCompletionResponse,
  planMercenaryChatResponse,
} from './mercenary-planner.js';
import { resolveChatE2eeRoute } from './e2ee-chat-route.js';
import { type ApiContext } from '../api-context.js';
import { type createAuthHandlers } from '../handlers/auth.js';
import { type createManaBillingHandlers } from '../handlers/billing-mana.js';
import { type createPaymentHandlers } from '../handlers/payment.js';
import { resolveApiKeyCaptureCostUsd } from './launch-payment-billing.js';
import { type createRaidHandlers } from '../handlers/raid.js';

type AuthHandlers = ReturnType<typeof createAuthHandlers>;
type ManaBillingHandlers = ReturnType<typeof createManaBillingHandlers>;
type PaymentHandlers = ReturnType<typeof createPaymentHandlers>;
type RaidHandlers = ReturnType<typeof createRaidHandlers>;

export type ChatCompletionRouteOptions = {
  discountInference?: boolean;
};

export type ChatCompletionPipelineDeps = {
  ctx: ApiContext;
  auth: AuthHandlers;
  manaBilling: ManaBillingHandlers;
  payment: PaymentHandlers;
  raid: RaidHandlers;
};

function readTrustedAlkahestStrictLane(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv
): boolean {
  return (
    readTrustedAlkahestClient(headers, {
      trustedKey: env.BOSSRAID_API_KEY || env.BOSSRAID_TRUSTED_CLIENT_KEY,
    }) != null
  );
}

export function prepareChatCompletionRequest(
  request: FastifyRequest,
  deps: ChatCompletionPipelineDeps,
  options: ChatCompletionRouteOptions = {}
) {
  const parsedChatRequest = parseChatCompletionRequest(request.body);
  const strictAlkahestLane = readTrustedAlkahestStrictLane(request.headers, deps.ctx.env);
  const discountDefaultMaxTotalCost = options.discountInference
    ? resolveDiscountInferenceDefaultMaxTotalCost(
        parsedChatRequest,
        deps.ctx.orchestrator.listProviders()
      )
    : undefined;
  const chatRequest = options.discountInference
    ? forceDiscountInferenceChatPolicy(parsedChatRequest, {
        defaultMaxTotalCost: discountDefaultMaxTotalCost,
        strictAlkahestLane,
      })
    : parsedChatRequest;
  const e2eeRoute = options.discountInference ? resolveChatE2eeRoute(chatRequest) : undefined;
  const raidRequest = e2eeRoute
    ? undefined
    : (chatRequest.raidRequest ??
      parseBossRaidRequest(
        buildBossRaidRequestFromChatCompletion(chatRequest, {
          defaultMaxTotalCost: discountDefaultMaxTotalCost ?? deps.ctx.chatDefaultMaxTotalCost,
        })
      ));

  return {
    chatRequest,
    raidRequest,
    created: Math.floor(Date.now() / 1000),
    paymentRoute: options.discountInference ? ('inference' as const) : ('chat' as const),
    e2eeRoute,
  };
}

export async function tryE2eeChatRelay(
  input: {
    chatRequest: ChatCompletionRequest;
    route: NonNullable<ReturnType<typeof resolveChatE2eeRoute>>;
    request: FastifyRequest;
    reply: FastifyReply;
    created: number;
  },
  deps: ChatCompletionPipelineDeps
) {
  try {
    return await executeE2eeChatRelay({
      chatRequest: input.chatRequest,
      route: input.route,
      request: input.request,
      reply: input.reply,
      inferenceReceiptStore: deps.ctx.inferenceReceiptStore,
      env: deps.ctx.env,
      created: input.created,
    });
  } catch (error) {
    input.reply.code(400);
    return {
      error: 'e2ee_relay_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function authorizeChatCompletionRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: ChatCompletionPipelineDeps,
  raidRequest: BossRaidSpawnInput
) {
  const { requireBuyerApiKeyRateLimit, readPublicAuth } = deps.auth;
  const publicAuth = readPublicAuth(request.headers);
  const apiKeyRateLimitError = requireBuyerApiKeyRateLimit(publicAuth, reply);
  if (apiKeyRateLimitError) {
    return { error: apiKeyRateLimitError };
  }

  const budgetError = enforceBuyerBudget(
    deps.ctx.controlState,
    publicAuth,
    raidRequest.constraints.maxBudgetUsd,
    deps.ctx.buyerMaxRequestBudgetUsd
  );
  if (budgetError) {
    reply.code(budgetError.statusCode);
    return {
      error: {
        error: budgetError.error,
        message: budgetError.message,
      },
    };
  }

  return { publicAuth };
}

export async function tryMercenaryPlannerDirectResponse(
  chatRequest: ChatCompletionRequest,
  created: number,
  options: ChatCompletionRouteOptions = {},
  env: NodeJS.ProcessEnv = process.env
) {
  if (options.discountInference) {
    return null;
  }

  const decision = await planMercenaryChatResponse({ chatRequest, env });
  if (decision.action !== 'direct' || !decision.reply) {
    return { decision };
  }

  return {
    decision,
    response: buildPlannerDirectChatCompletionResponse(chatRequest, created, decision.reply),
  };
}

export function applyMercenaryPlannerRaidRequest(
  raidRequest: BossRaidSpawnInput,
  decision: Awaited<ReturnType<typeof planMercenaryChatResponse>>
) {
  if (decision.action !== 'raid') {
    return raidRequest;
  }

  return applyMercenaryPlannerOverrides(raidRequest, decision.raidPolicyOverrides);
}

export async function launchPaidChatRaid(
  input: {
    request: FastifyRequest;
    raidRequest: BossRaidSpawnInput;
    paymentRoute: 'chat' | 'inference';
  },
  deps: ChatCompletionPipelineDeps
) {
  const { requireReservedLaunchPayment, reconcileLaunchPayment } = deps.payment;
  await deps.raid.ensureErc8004ProofState({ includeMercenary: false });
  const launchPayment = deps.auth.adminIsAuthorized(input.request.headers)
    ? {}
    : await requireReservedLaunchPayment(input.paymentRoute, input.request, input.raidRequest);

  try {
    const spawn =
      launchPayment.reservationId && launchPayment.requestKey
        ? await deps.ctx.orchestrator.spawnReservedRaid(
            launchPayment.reservationId,
            launchPayment.requestKey,
            launchPayment.escrowFundingUsd,
            launchPayment.platformMarkupUsd
          )
        : await deps.ctx.orchestrator.spawnRaid(
            input.raidRequest,
            launchPayment.escrowFundingUsd,
            launchPayment.platformMarkupUsd
          );

    return { launchPayment, spawn };
  } catch (error) {
    await reconcileLaunchPayment({
      route: input.paymentRoute,
      request: input.request,
      raidRequest: input.raidRequest,
      launchPayment,
      reason: 'spawn_failed',
    });
    throw error;
  }
}

export async function deliverStreamingChatCompletion(
  input: {
    request: FastifyRequest;
    reply: FastifyReply;
    chatRequest: ChatCompletionRequest;
    raidRequest: BossRaidSpawnInput;
    spawn: Awaited<ReturnType<ChatCompletionPipelineDeps['ctx']['orchestrator']['spawnRaid']>>;
    created: number;
    launchPayment: Awaited<ReturnType<PaymentHandlers['requireReservedLaunchPayment']>>;
    publicAuth: ReturnType<AuthHandlers['readPublicAuth']>;
  },
  deps: ChatCompletionPipelineDeps
) {
  const { captureManaBilling, refundManaBilling, buildBossRaidBillingMetadata } = deps.manaBilling;
  const {
    captureApiKeyBilling,
    recordMarketplaceLedgersFromRaid,
    reconcileLaunchPayment,
    releaseLaunchPaymentHold,
  } = deps.payment;

  applyX402Headers(input.reply, {
    settlement: input.launchPayment.settlement,
  });

  await streamChatCompletionResponse(input.reply, deps.ctx.orchestrator, {
    chatRequest: input.chatRequest,
    raidRequest: input.raidRequest,
    spawn: input.spawn,
    created: input.created,
    settleGraceMs: deps.ctx.chatTerminalSettleGraceMs,
    settlementMode: deps.ctx.settlementMode,
    bossraidBilling:
      input.launchPayment.manaBilling || input.launchPayment.apiKeyBilling
        ? {
            capture: async (usage, selectedSeller) => {
              if (input.launchPayment.manaBilling) {
                const settlement = await captureManaBilling({
                  manaBilling: input.launchPayment.manaBilling,
                  usage,
                  raidId: input.spawn.raidId,
                  receiptPath: input.spawn.receiptPath,
                });
                return buildBossRaidBillingMetadata({
                  manaBilling: input.launchPayment.manaBilling,
                  settlement,
                  selectedSeller,
                  receiptPath: input.spawn.receiptPath,
                });
              }

              const result = deps.ctx.orchestrator.getResult(input.spawn.raidId);
              const capturedCostUsd = resolveApiKeyCaptureCostUsd({
                apiKeyBilling: input.launchPayment.apiKeyBilling,
                escrowFundingUsd: input.launchPayment.escrowFundingUsd,
                successfulProvidersPaid: result.settlement?.successfulProvidersPaid,
                maxBudgetUsd: input.raidRequest.constraints.maxBudgetUsd,
              });
              const resolvedSeller =
                selectedSeller ??
                result.synthesizedOutput?.baseSubmissionProviderId ??
                result.approvedSubmissions?.[0]?.submission.providerId;
              captureApiKeyBilling({
                apiKeyBilling: input.launchPayment.apiKeyBilling,
                actualCostUsd: capturedCostUsd,
                route: 'chat',
                raidId: input.spawn.raidId,
                modelId: input.chatRequest.model,
                sellerId: resolvedSeller,
              });
              recordMarketplaceLedgersFromRaid({
                raidId: input.spawn.raidId,
                route: 'chat',
                buyerWallet: input.publicAuth?.wallet,
                apiKeyId:
                  input.publicAuth?.type === 'api_key' ? input.publicAuth.apiKeyId : undefined,
                modelId: input.chatRequest.model,
                costUsd: capturedCostUsd,
                skipBuyerPurchase: true,
              });
              return buildBossRaidBillingMetadata({
                selectedSeller: resolvedSeller,
                receiptPath: input.spawn.receiptPath,
                modelId: input.chatRequest.model,
                paidPriceUsd: capturedCostUsd,
              });
            },
          }
        : undefined,
    onFailure: async (error, outcome) => {
      const billingCaptureFailed = Boolean(outcome) && !(error instanceof ChatTerminalWaitError);
      if (billingCaptureFailed) {
        // captureApiKeyBilling already releases the hold before throwing this message.
        const holdAlreadyReleased =
          error instanceof ApiContractError && error.message.includes('launch hold released');
        if (!holdAlreadyReleased) {
          await releaseLaunchPaymentHold({ launchPayment: input.launchPayment });
        }
        return;
      }

      const reason =
        error instanceof ChatTerminalWaitError ? 'terminal_wait_timeout' : 'terminal_output_failed';
      await refundManaBilling({
        manaBilling: input.launchPayment.manaBilling,
        reason,
        raidId: input.spawn.raidId,
      });
      await reconcileLaunchPayment({
        route: 'chat',
        request: input.request,
        raidRequest: input.raidRequest,
        launchPayment: input.launchPayment,
        reason,
        raidId: input.spawn.raidId,
      });
    },
  });
}

export async function deliverBufferedChatCompletion(
  input: {
    request: FastifyRequest;
    reply: FastifyReply;
    chatRequest: ChatCompletionRequest;
    raidRequest: BossRaidSpawnInput;
    spawn: Awaited<ReturnType<ChatCompletionPipelineDeps['ctx']['orchestrator']['spawnRaid']>>;
    created: number;
    launchPayment: Awaited<ReturnType<PaymentHandlers['requireReservedLaunchPayment']>>;
    publicAuth: ReturnType<AuthHandlers['readPublicAuth']>;
    paymentRoute: 'chat' | 'inference';
  },
  deps: ChatCompletionPipelineDeps
) {
  const { captureManaBilling, refundManaBilling, buildBossRaidBillingMetadata } = deps.manaBilling;
  const { captureApiKeyBilling, recordMarketplaceLedgersFromRaid, reconcileLaunchPayment } =
    deps.payment;

  let outcome;
  try {
    outcome = await waitForTerminalRaidOutput(
      deps.ctx.orchestrator,
      input.spawn.raidId,
      Math.max(input.raidRequest.constraints.maxLatencySec * 1000, TIMEOUTS.MIN_TIMEOUT_MS),
      deps.ctx.chatTerminalSettleGraceMs,
      deps.ctx.settlementMode
    );
  } catch (error) {
    const reason =
      error instanceof ChatTerminalWaitError ? 'terminal_wait_timeout' : 'terminal_output_failed';
    await refundManaBilling({
      manaBilling: input.launchPayment.manaBilling,
      reason,
      raidId: input.spawn.raidId,
    });
    await reconcileLaunchPayment({
      route: input.paymentRoute,
      request: input.request,
      raidRequest: input.raidRequest,
      launchPayment: input.launchPayment,
      reason,
      raidId: input.spawn.raidId,
    });
    throw error;
  }

  const response = buildChatCompletionResponse(
    input.chatRequest,
    input.spawn,
    outcome,
    input.created
  ) as ReturnType<typeof buildChatCompletionResponse> & { bossraid?: unknown };
  const manaSettlement = await captureManaBilling({
    manaBilling: input.launchPayment.manaBilling,
    usage: response.usage,
    raidId: input.spawn.raidId,
    receiptPath: input.spawn.receiptPath,
  });
  const selectedSeller =
    outcome.result.synthesizedOutput?.baseSubmissionProviderId ??
    outcome.result.approvedSubmissions?.[0]?.submission.providerId;
  const capturedCostUsd = resolveApiKeyCaptureCostUsd({
    apiKeyBilling: input.launchPayment.apiKeyBilling,
    escrowFundingUsd: input.launchPayment.escrowFundingUsd,
    successfulProvidersPaid: outcome.result.settlement?.successfulProvidersPaid,
    maxBudgetUsd: input.raidRequest.constraints.maxBudgetUsd,
  });
  const bossraid = buildBossRaidBillingMetadata({
    manaBilling: input.launchPayment.manaBilling,
    settlement: manaSettlement,
    selectedSeller,
    receiptPath: input.spawn.receiptPath,
    modelId: input.chatRequest.model,
    paidPriceUsd: capturedCostUsd,
  });
  if (bossraid) {
    response.bossraid = bossraid;
  }

  captureApiKeyBilling({
    apiKeyBilling: input.launchPayment.apiKeyBilling,
    actualCostUsd: capturedCostUsd,
    route: input.paymentRoute,
    raidId: input.spawn.raidId,
    modelId: input.chatRequest.model,
    sellerId: selectedSeller,
  });
  recordMarketplaceLedgersFromRaid({
    raidId: input.spawn.raidId,
    route: input.paymentRoute,
    buyerWallet: input.publicAuth?.wallet,
    apiKeyId: input.publicAuth?.type === 'api_key' ? input.publicAuth.apiKeyId : undefined,
    modelId: input.chatRequest.model,
    costUsd: capturedCostUsd,
    skipBuyerPurchase: Boolean(input.launchPayment.apiKeyBilling),
  });
  applyX402Headers(input.reply, {
    settlement: input.launchPayment.settlement,
  });

  return response;
}
