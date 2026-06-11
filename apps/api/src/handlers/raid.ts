import { type FastifyReply, type FastifyRequest } from 'fastify';
import { probeProviderHealth } from '@bossraid/provider-sdk';
import logger from '@bossraid/logger';
import {
  asSingleHeader,
  type BossRaidSpawnInput,
  type ProviderHealthStatus,
  type ProviderProfile,
} from '@bossraid/shared-types';
import { applyX402Headers } from '../x402.js';
import { buildAgentLog } from '../agent-artifacts.js';
import {
  persistSettlementExecutionArtifact,
  settlementExecutionChanged,
} from '../settlement-proof.js';
import { RAID_ACCESS_TOKEN_HEADER } from '../lib/http.js';
import {
  buildInferenceMarkets,
  providerHasStrictPrivateMarketMetadata,
  readProviderMarketRateUsd,
  resolveProviderMarketModelId,
} from '../lib/inference-marketplace.js';
import {
  buildAttestedRaidResultPayload,
  buildAttestedRaidResultMessage,
  hashAttestationText,
} from '../lib/attestation.js';
import { type ApiContext } from '../api-context.js';
import { createAuthHandlers } from './auth.js';
import { createPaymentHandlers } from './payment.js';

export function createRaidHandlers(
  ctx: ApiContext,
  auth: ReturnType<typeof createAuthHandlers>,
  payment: ReturnType<typeof createPaymentHandlers>
) {
  const { requireRateLimit, requireRaidReadAccess, readRaidAccessTokenQuery, requireAdmin } = auth;
  const { requireReservedLaunchPayment, recordMarketplaceLedgersFromRaid } = payment;

  function serializeProviderProfile(
    provider: ProviderProfile,
    options: { includeEndpoint?: boolean } = {}
  ) {
    return {
      providerId: provider.providerId,
      agentId: provider.agentId,
      displayName: provider.displayName,
      description: provider.description,
      endpointType: provider.endpointType,
      endpoint: options.includeEndpoint ? provider.endpoint : undefined,
      specializations: provider.specializations,
      supportedLanguages: provider.supportedLanguages,
      supportedFrameworks: provider.supportedFrameworks,
      pricing: provider.pricing,
      pricePerTaskUsd: provider.pricePerTaskUsd,
      maxConcurrency: provider.maxConcurrency,
      status: provider.status,
      modelFamily: provider.modelFamily,
      agentFramework: provider.agentFramework,
      modelProvider: provider.modelProvider,
      modelId: provider.modelId,
      outputTypes: provider.outputTypes,
      verification: provider.verification,
      privacy: provider.privacy,
      erc8004: provider.erc8004,
      trust: provider.trust,
      reputation: provider.reputation,
      scores: provider.scores,
      lastSeenAt: provider.lastSeenAt,
      source: provider.source,
      marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
    };
  }

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

  function serializeProviderHealth(
    health: ProviderHealthStatus,
    options: { includeDiagnostics?: boolean; includeEndpoint?: boolean } = {}
  ) {
    return {
      providerId: health.providerId,
      providerName: health.providerName,
      endpoint: options.includeEndpoint ? health.endpoint : undefined,
      reachable: health.reachable,
      ready: health.ready,
      statusCode: health.statusCode,
      model: health.model,
      missing: options.includeDiagnostics ? health.missing : undefined,
      modelApiBase: options.includeDiagnostics ? health.modelApiBase : undefined,
      error: options.includeDiagnostics ? health.error : undefined,
    };
  }

  function buildInferenceMarketSnapshot(
    options: {
      modelId?: string;
      modelProvider?: string;
      agentFramework?: string;
      maxBudgetUsd?: number;
      privacyMode?: string;
      verificationStatus?: string;
    } = {}
  ) {
    const providers = ctx.orchestrator.listProviders().filter((provider) => {
      if (options.modelId && provider.modelId !== options.modelId) {
        return false;
      }
      if (options.modelProvider && provider.modelProvider !== options.modelProvider) {
        return false;
      }
      if (options.agentFramework && provider.agentFramework !== options.agentFramework) {
        return false;
      }
      if (
        typeof options.maxBudgetUsd === 'number' &&
        readProviderMarketRateUsd(provider) > options.maxBudgetUsd
      ) {
        return false;
      }
      if (
        options.verificationStatus &&
        (provider.verification?.status ?? 'pending') !== options.verificationStatus
      ) {
        return false;
      }
      if (options.privacyMode === 'strict' && !providerHasStrictPrivateMarketMetadata(provider)) {
        return false;
      }
      if ((provider.marketplaceOfferStatus ?? 'active') === 'paused') {
        return false;
      }
      return Boolean(resolveProviderMarketModelId(provider));
    });

    return buildInferenceMarkets(providers);
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
    const response =
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
    applyX402Headers(reply, {
      settlement: launchPayment.settlement,
    });
    return response;
  }

  function registerRaidDetailRoutes(basePath: '/v1/raid' | '/v1/raids'): void {
    ctx.app.get(`${basePath}/:raidId`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      return ctx.orchestrator.getStatus(raidId);
    });

    ctx.app.get(`${basePath}/:raidId/result`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      await ensureSettlementProofState(raidId);
      const result = ctx.orchestrator.getResult(raidId);
      if (result.status === 'final') {
        recordMarketplaceLedgersFromRaid({
          raidId,
          route: 'raid',
          skipBuyerPurchase: true,
        });
      }
      return result;
    });

    ctx.app.get(`${basePath}/:raidId/agent_log.json`, async (request, reply) => {
      const raidId = getRaidId(request);
      const queryAccessToken = readRaidAccessTokenQuery(request.query);
      const authorizationError = requireRaidReadAccess(
        reply,
        raidId,
        request.headers,
        queryAccessToken
      );
      if (authorizationError) {
        return authorizationError;
      }

      const raid = ctx.orchestrator.getRaid(raidId);
      if (!raid) {
        reply.code(404);
        return {
          error: 'not_found',
          message: `Unknown raid: ${raidId}`,
        };
      }

      reply.header('cache-control', 'private, no-store');
      await ensureSettlementProofState(raidId);
      await ensureErc8004ProofState({ includeMercenary: false });
      return buildAgentLog(raid, {
        getRaid: (currentRaidId) => ctx.orchestrator.getRaid(currentRaidId),
        getProvider: (providerId) => ctx.orchestrator.getProviderProfile(providerId),
        raidAccessToken:
          asSingleHeader(request.headers[RAID_ACCESS_TOKEN_HEADER]) ?? queryAccessToken,
      });
    });

    ctx.app.get(`${basePath}/:raidId/attested-result`, async (request, reply) => {
      const raidId = getRaidId(request);
      const authorizationError = requireRaidReadAccess(reply, raidId, request.headers);
      if (authorizationError) {
        return authorizationError;
      }

      if (!ctx.teeSigner.account) {
        reply.code(503);
        return {
          error: 'tee_signer_not_configured',
          message:
            ctx.teeSigner.error ??
            'MNEMONIC environment variable is required for attested raid result proofs.',
        };
      }

      await ensureSettlementProofState(raidId);
      const result = ctx.orchestrator.getResult(raidId);
      const payload = buildAttestedRaidResultPayload(ctx.env, result, ctx.workerIsolation);
      const message = buildAttestedRaidResultMessage(payload);
      const signature = await ctx.teeSigner.account.signMessage({ message });

      return {
        signer: ctx.teeSigner.account.address,
        message,
        messageHash: hashAttestationText(message),
        signature,
        payload,
      };
    });

    ctx.app.post(`${basePath}/:raidId/abort`, async (request, reply) => {
      const adminError = requireAdmin(reply, request.headers);
      if (adminError) {
        return adminError;
      }

      return ctx.orchestrator.abortRaid(getRaidId(request));
    });
  }

  async function collectProviderHealth() {
    return Promise.all(
      ctx.orchestrator.listProviders().map((provider) => probeProviderHealth(provider))
    );
  }

  return {
    serializeProviderProfile,
    buildProviderSettlementPayload,
    ensureErc8004ProofState,
    ensureSettlementProofState,
    serializeProviderHealth,
    buildInferenceMarketSnapshot,
    validateProviderCallback,
    getRaidId,
    spawnParsedRaid,
    registerRaidDetailRoutes,
    collectProviderHealth,
  };
}
