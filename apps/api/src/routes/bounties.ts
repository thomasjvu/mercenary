import { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  parseAwardBountyBidsInput,
  parseBossRaidRequest,
  parseCreateBountyBidInput,
  parseCreateBountyInput,
  parseDeliverBountyAwardInput,
} from '@bossraid/api-contracts';
import { findWorkspaceRoot, resolveWorkspacePath } from '@bossraid/constants/workspace';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';
import { requireMercenaryAccess } from '../handlers/auth/mercenary-access.js';
import { readBooleanEnv } from '../lib/env.js';
import {
  BountyService,
  BountyServiceError,
  hashDeliveryPayload,
  readBountyServiceConfig,
} from '../lib/bounty-service.js';
import { BountyStore } from '../lib/bounty-store.js';
import logger from '@bossraid/logger';
import {
  BountyOnchainError,
  createBountyOnchainExecutor,
  isBountyOnchainConfigured,
  mapBountyOnchainError,
  parseProviderAddressMap,
  requiresProductionBountyEscrow,
} from '../lib/bounty-onchain.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import {
  applyX402Headers,
  buildPaymentRequiredForRoute,
  isX402ProtocolError,
  requireX402Payment,
} from '../x402.js';

function bountyStoreForEnv(env: NodeJS.ProcessEnv): BountyStore {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const path =
    resolveWorkspacePath(
      env.BOSSRAID_BOUNTY_SQLITE_FILE ??
        env.BOSSRAID_SQLITE_FILE ??
        './temp/bossraid-bounties.sqlite',
      workspaceRoot
    ) ?? `${workspaceRoot}/temp/bossraid-bounties.sqlite`;
  return new BountyStore(path);
}

export function registerBountyRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const store = bountyStoreForEnv(ctx.env);
  const onchainExecutor = createBountyOnchainExecutor(ctx.env);
  const providerAddresses = parseProviderAddressMap(ctx.env);
  const service = new BountyService(
    store,
    readBountyServiceConfig(ctx.env),
    ctx.orchestrator,
    onchainExecutor ? { executor: onchainExecutor, providerAddresses } : undefined
  );
  const { providerIsAuthorized } = handlers.auth;

  const deadlineIntervalMs = Number(ctx.env.BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS ?? '60000');
  if (Number.isFinite(deadlineIntervalMs) && deadlineIntervalMs > 0) {
    setInterval(() => {
      void service.processDeadlines().catch((error: unknown) => {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'bounty deadline worker failed'
        );
      });
    }, deadlineIntervalMs).unref?.();
  }

  app.post('/v1/bounties', async (request, reply) => {
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }
    if (!access.wallet) {
      reply.code(401);
      return { error: 'unauthorized', message: 'Wallet session required to post bounties.' };
    }
    try {
      const bounty = service.createBounty(access.wallet, parseCreateBountyInput(request.body));
      reply.code(201);
      return { bounty };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/fund', async (request, reply) => {
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }
    if (!access.wallet) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const params = request.params as { bountyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const isProduction = ctx.env.NODE_ENV === 'production';
    const allowUnverifiedFund =
      !isProduction &&
      (readBooleanEnv(ctx.env.BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND) ||
        readBooleanEnv(ctx.env.BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND));

    try {
      const draft = store.getBounty(params.bountyId);
      if (!draft) {
        reply.code(404);
        return { error: 'not_found', message: 'Bounty not found.' };
      }
      if (draft.posterWallet !== access.wallet.toLowerCase()) {
        reply.code(403);
        return { error: 'forbidden', message: 'Only the bounty poster can fund this bounty.' };
      }

      const x402Config = readX402ConfigForContext(ctx);
      let escrowReceiptJson =
        typeof body.escrowReceiptJson === 'string'
          ? body.escrowReceiptJson
          : typeof body.escrow_receipt_json === 'string'
            ? body.escrow_receipt_json
            : undefined;
      let escrowJobId =
        typeof body.escrowJobId === 'string'
          ? body.escrowJobId
          : typeof body.escrow_job_id === 'string'
            ? body.escrow_job_id
            : undefined;

      const mustEscrowOnchain =
        requiresProductionBountyEscrow(ctx.env) || isBountyOnchainConfigured(ctx.env);

      if (mustEscrowOnchain && !onchainExecutor) {
        reply.code(503);
        return {
          error: 'bounty_escrow_unconfigured',
          message:
            'Onchain bounty escrow is required but BOSSRAID_BOUNTY_ESCROW_ADDRESS, token, RPC, and client signer are not fully configured.',
        };
      }

      if (onchainExecutor) {
        try {
          await onchainExecutor.preflightFundBounty(draft);
        } catch (error) {
          return mapOnchainRouteError(reply, error);
        }
      }

      if (x402Config.enabled) {
        const paymentRequired = buildPaymentRequiredForRoute(
          x402Config,
          'bounty',
          draft.rewardAmountUsd,
          { extra: { bountyId: params.bountyId } }
        );
        const payment = await requireX402Payment({
          route: 'bounty',
          headers: request.headers,
          config: x402Config,
          budgetUsd: draft.rewardAmountUsd,
          paymentRequired,
        });
        applyX402Headers(reply, { settlement: payment.settlement });
        if (payment.settlement?.payer && payment.settlement.payer.toLowerCase() !== access.wallet) {
          reply.code(403);
          return {
            error: 'payer_mismatch',
            message: 'x402 payer must match the bounty poster wallet.',
          };
        }
        escrowReceiptJson = JSON.stringify({
          route: 'bounty',
          paidAmountUsd: payment.paidAmountUsd,
          escrowFundingUsd: payment.escrowFundingUsd,
          platformMarkupUsd: payment.platformMarkupUsd,
          settlement: payment.settlement,
        });

        if (onchainExecutor) {
          try {
            const onchain = await onchainExecutor.createAndFundBounty({
              posterWallet: access.wallet,
              bounty: draft,
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
                bountyId: params.bountyId,
                settlement: payment.settlement,
                error: error instanceof Error ? error.message : String(error),
              },
              'bounty onchain fund failed after x402 settlement'
            );
            reply.code(502);
            return {
              error: 'escrow_fund_failed',
              message:
                'Payment settled but onchain bounty escrow funding failed. Contact support with your payment transaction for a manual refund.',
              settlement: payment.settlement,
            };
          }
        } else if (requiresProductionBountyEscrow(ctx.env)) {
          reply.code(503);
          return {
            error: 'bounty_escrow_unconfigured',
            message: 'Production bounty funding requires onchain escrow.',
          };
        }
      } else if (!allowUnverifiedFund) {
        reply.code(503);
        return {
          error: 'payments_disabled',
          message: isProduction
            ? 'Bounty funding requires x402 USDC payments in production.'
            : 'Enable BOSSRAID_X402_ENABLED or BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND for local development.',
        };
      }

      const bounty = service.fundBounty(params.bountyId, access.wallet, {
        escrowReceiptJson,
        escrowJobId,
        openNow: body.openNow !== false && body.open_now !== false,
      });
      return { bounty, onchainEscrow: Boolean(escrowJobId) };
    } catch (error) {
      if (isX402ProtocolError(error)) {
        applyX402Headers(reply, {
          paymentRequired: error.paymentRequired,
          settlement: error.settlement,
        });
        reply.code(error.statusCode);
        return error.paymentRequired;
      }
      return mapBountyError(reply, error);
    }
  });

  app.get('/v1/bounties', async (request) => {
    const query = request.query as { limit?: string; status?: string };
    const limit = query.limit ? Number(query.limit) : 50;
    const bounties =
      query.status === 'open'
        ? service.listOpenBounties(limit)
        : store.listBounties({ limit, status: query.status as never });
    return { cloudEnabled: true, bounties };
  });

  app.get('/v1/bounties/:bountyId', async (request, reply) => {
    const params = request.params as { bountyId: string };
    try {
      return service.getDetail(params.bountyId);
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/bids', async (request, reply) => {
    const params = request.params as { bountyId: string };
    const bidInput = parseCreateBountyBidInput(request.body);
    const provider = ctx.orchestrator
      .listProviders()
      .find((entry) => entry.providerId === bidInput.providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found', message: 'Provider not found.' };
    }
    if (
      !providerIsAuthorized(bidInput.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    try {
      const bid = service.submitBid(params.bountyId, bidInput, provider);
      reply.code(201);
      return { bid };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/award', async (request, reply) => {
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }
    if (!access.wallet) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const params = request.params as { bountyId: string };
    try {
      return await service.awardBids(
        params.bountyId,
        access.wallet,
        parseAwardBountyBidsInput(request.body)
      );
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/awards/:awardId/deliver', async (request, reply) => {
    const params = request.params as { bountyId: string; awardId: string };
    const delivery = parseDeliverBountyAwardInput(request.body);
    const award = store.getAward(params.awardId);
    if (!award || award.bountyId !== params.bountyId) {
      reply.code(404);
      return { error: 'not_found' };
    }
    if (
      !providerIsAuthorized(award.providerId, {
        method: request.method,
        path: request.url,
        body: request.body,
        headers: request.headers,
      })
    ) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const expectedHash = hashDeliveryPayload(delivery.artifactsJson);
    if (delivery.deliveryHash !== expectedHash) {
      reply.code(400);
      return {
        error: 'invalid_delivery_hash',
        message: 'delivery_hash must match sha256(artifacts_json).',
        expectedHash,
      };
    }
    try {
      const updated = await service.deliverAward(params.awardId, award.providerId, delivery);
      return { award: updated };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/awards/:awardId/accept', async (request, reply) => {
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }
    if (!access.wallet) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const params = request.params as { bountyId: string; awardId: string };
    try {
      const award = await service.acceptAward(params.awardId, access.wallet);
      return { award };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/awards/:awardId/claim', async (request, reply) => {
    const params = request.params as { bountyId: string; awardId: string };
    try {
      const award = await service.claimAward(params.awardId);
      return { award };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/refund', async (request, reply) => {
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }
    if (!access.wallet) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    const params = request.params as { bountyId: string };
    try {
      const bounty = await service.refundBounty(params.bountyId, access.wallet);
      return { bounty };
    } catch (error) {
      return mapBountyError(reply, error);
    }
  });

  app.post('/v1/bounties/:bountyId/raids', async (request, reply) => {
    const params = request.params as { bountyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const awardId = typeof body.awardId === 'string' ? body.awardId : undefined;
    const award = awardId ? store.getAward(awardId) : undefined;
    if (!award || award.bountyId !== params.bountyId) {
      reply.code(404);
      return { error: 'not_found', message: 'Award not found for bounty.' };
    }
    const raidBody = {
      agent: 'mercenary-v1',
      taskType: 'bounty_execution',
      task: {
        title: 'Bounty execution',
        description: 'Execute an awarded bounty through Mercenary.',
        language: 'text',
        files: [],
        failingSignals: { errors: [] },
      },
      output: { primaryType: 'text', artifactTypes: ['text'] },
      ...(typeof body.raidRequest === 'object' && body.raidRequest ? body.raidRequest : body),
      raidPolicy: {
        ...((body.raidPolicy as Record<string, unknown> | undefined) ?? {}),
        requiredProviderIds: [award.providerId],
        maxTotalCost: award.amountUsd,
      },
      hostContext: {
        host: 'party-quest',
        ...(typeof body.hostContext === 'object' && body.hostContext ? body.hostContext : {}),
      },
    };
    return handlers.raid.spawnParsedRaid(request, reply, () => parseBossRaidRequest(raidBody));
  });
}

function mapBountyError(reply: FastifyReply, error: unknown) {
  if (error instanceof BountyServiceError) {
    reply.code(error.statusCode);
    return { error: 'bounty_error', message: error.message };
  }
  if (error instanceof BountyOnchainError) {
    return mapOnchainRouteError(reply, error);
  }
  throw error;
}

function mapOnchainRouteError(reply: FastifyReply, error: unknown) {
  const mapped = mapBountyOnchainError(error);
  reply.code(mapped.code === 'insufficient_operator_balance' ? 503 : 502);
  return { error: mapped.code, message: mapped.message };
}
