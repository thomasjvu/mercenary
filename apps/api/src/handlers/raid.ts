import { type FastifyReply, type FastifyRequest } from 'fastify';
import { probeAllProviderHealth } from '../lib/provider-health.js';
import logger from '@bossraid/logger';
import { type BossRaidSpawnInput, type ProviderProfile } from '@bossraid/shared-types';
import { applyX402Headers } from '../x402.js';
import {
  persistSettlementExecutionArtifact,
  settlementExecutionChanged,
} from '../settlement-proof.js';

import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import { buildRaidPaymentProof } from '../lib/payment-proof.js';
import { type ApiContext } from '../api-context.js';
import { createAuthHandlers } from './auth.js';
import { createPaymentHandlers } from './payment.js';

export function createRaidHandlers(
  ctx: ApiContext,
  auth: ReturnType<typeof createAuthHandlers>,
  payment: ReturnType<typeof createPaymentHandlers>
) {
  const { requireRateLimit } = auth;
  const { requireReservedLaunchPayment, recordMarketplaceLedgersFromRaid, reconcileLaunchPayment } =
    payment;

  async function ensureErc8004ProofState(
    options: {
      includeMercenary?: boolean;
      providers?: ProviderProfile[];
    } = {}
  ): Promise<void> {
    if (!ctx.erc8004Verifier.enabled) {
      return;
    }

    const providers = options.providers ?? ctx.orchestrator.listProviders();
    await ctx.erc8004Verifier.verifyProviders(providers);
    if (options.includeMercenary !== false) {
      ctx.mercenaryIdentity = await ctx.erc8004Verifier.verifyIdentity(ctx.mercenaryIdentity);
    }
  }

  async function ensureSettlementProofState(raidId: string): Promise<void> {
    const raid = ctx.orchestrator.getRaid(raidId);
    if (!raid?.settlementExecution) {
      return;
    }

    const refreshed = await ctx.settlementProofRefresher.refresh(raid.settlementExecution);
    if (!refreshed || !settlementExecutionChanged(raid.settlementExecution, refreshed)) {
      return;
    }

    await ctx.orchestrator.updateSettlementExecution(raidId, refreshed);
    try {
      await persistSettlementExecutionArtifact(refreshed);
    } catch (error) {
      logger.error(error, 'Mercenary settlement artifact sync error');
    }
  }

  async function buildProviderSettlementPayload(
    raidId: string,
    providerId: string
  ): Promise<Record<string, unknown> | undefined> {
    const raid = ctx.orchestrator.getRaid(raidId);
    if (!raid || !raid.selectedProviders.includes(providerId)) {
      return undefined;
    }
    await ensureSettlementProofState(raidId);
    const result = ctx.orchestrator.getResult(raidId);
    const ranked = result.rankedSubmissions?.find(
      (entry) => entry.submission.providerId === providerId
    );
    const grossUsd =
      ranked?.breakdown.valid && result.settlement
        ? result.settlement.payoutPerSuccessfulProvider
        : 0;
    return {
      raidId,
      providerId,
      status: raid.status,
      grossUsd,
      feesUsd: 0,
      netUsd: grossUsd,
      receiptPath: `/receipt?raidId=${raidId}`,
      settlement: result.settlement,
      settlementExecution: result.settlementExecution,
      assignment: raid.assignments[providerId],
      valid: ranked?.breakdown.valid ?? false,
    };
  }

  function validateProviderCallback(
    raidId: string,
    providerId: string,
    providerRunId?: string
  ): { ok: true } | { ok: false; statusCode: number; body: { error: string; message: string } } {
    const raid = ctx.orchestrator.getRaid(raidId);
    if (!raid) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: 'not_found',
          message: `Unknown raid: ${raidId}`,
        },
      };
    }

    const assignment = raid.assignments[providerId];
    if (!assignment) {
      return {
        ok: false,
        statusCode: 404,
        body: {
          error: 'provider_not_assigned',
          message: `Provider ${providerId} is not assigned to raid ${raidId}.`,
        },
      };
    }

    if (!assignment.providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_not_ready',
          message: `Provider ${providerId} has not accepted raid ${raidId} yet.`,
        },
      };
    }

    if (!providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_required',
          message: `Provider ${providerId} must include providerRunId for raid ${raidId}.`,
        },
      };
    }

    if (assignment.providerRunId !== providerRunId) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          error: 'provider_run_mismatch',
          message: `Provider run ${providerRunId} does not match the active assignment for raid ${raidId}.`,
        },
      };
    }

    return { ok: true };
  }

  function getRaidId(request: { params: unknown }): string {
    return (request.params as { raidId: string }).raidId;
  }

  async function spawnParsedRaid(
    request: FastifyRequest,
    reply: FastifyReply,
    parseInput: (value: unknown) => BossRaidSpawnInput,
    options: {
      requirePayment?: boolean;
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

    const input = parseInput(request.body);
    await ensureErc8004ProofState({ includeMercenary: false });
    const launchPayment =
      options.requirePayment === false
        ? {}
        : await requireReservedLaunchPayment('raid', request, input);
    let response;
    try {
      response =
        launchPayment.reservationId && launchPayment.requestKey
          ? await ctx.orchestrator.spawnReservedRaid(
              launchPayment.reservationId,
              launchPayment.requestKey,
              launchPayment.escrowFundingUsd,
              launchPayment.platformMarkupUsd
            )
          : await ctx.orchestrator.spawnRaid(
              input,
              launchPayment.escrowFundingUsd,
              launchPayment.platformMarkupUsd
            );
    } catch (error) {
      await reconcileLaunchPayment({
        route: 'raid',
        request,
        raidRequest: input,
        launchPayment,
        reason: 'spawn_failed',
      });
      throw error;
    }
    const paymentProof = buildRaidPaymentProof({
      launchPayment,
      config: readX402ConfigForContext(ctx),
      request,
    });
    if (paymentProof) {
      ctx.orchestrator.attachRaidPaymentProof(response.raidId, paymentProof);
    }

    applyX402Headers(reply, {
      settlement: launchPayment.settlement,
    });
    return response;
  }

  async function collectProviderHealth() {
    return probeAllProviderHealth(ctx.orchestrator);
  }

  return {
    buildProviderSettlementPayload,
    ensureErc8004ProofState,
    ensureSettlementProofState,
    validateProviderCallback,
    getRaidId,
    spawnParsedRaid,
    collectProviderHealth,
  };
}
