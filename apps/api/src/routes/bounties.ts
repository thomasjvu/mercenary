import { randomUUID } from 'node:crypto';
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
import {
  assertBountyFundEscrowReady,
  parseBountyFundBody,
  paymentsDisabledForBountyFund,
  preflightBountyFundOnchain,
  prepareBountyFundPayment,
} from '../lib/bounty-fund.js';
import { rejectClientSuppliedEscrowProof } from '../lib/bounty-fund-security.js';
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
  mapBountyOnchainError,
  parseProviderAddressMap,
} from '../lib/bounty-onchain.js';
import { sendX402Required } from '../lib/x402-route-response.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import { isX402ProtocolError } from '../x402.js';

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
  const onchainExecutor = createBountyOnchainExecutor(ctx.env) ?? undefined;
  const providerAddresses = parseProviderAddressMap(ctx.env);
  const service = new BountyService(
    store,
    readBountyServiceConfig(ctx.env),
    onchainExecutor ? { executor: onchainExecutor, providerAddresses } : undefined
  );
  const { providerIsAuthorized } = handlers.auth;

  const deadlineIntervalMs = Number(ctx.env.BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS ?? '60000');
  const deadlineWorkerId = `bounty-deadline-${randomUUID()}`;
  if (Number.isFinite(deadlineIntervalMs) && deadlineIntervalMs > 0) {
    setInterval(() => {
      if (!store.tryAcquireDeadlineWorkerLock(deadlineWorkerId, deadlineIntervalMs * 2)) {
        return;
      }
      void service
        .processDeadlines()
        .catch((error: unknown) => {
          logger.warn(
            { error: error instanceof Error ? error.message : String(error) },
            'bounty deadline worker failed'
          );
        })
        .finally(() => store.releaseDeadlineWorkerLock(deadlineWorkerId));
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
    const fundBody = parseBountyFundBody((request.body ?? {}) as Record<string, unknown>);
    const escrowProofGate = rejectClientSuppliedEscrowProof({
      env: ctx.env,
      x402Enabled: readX402ConfigForContext(ctx).enabled,
      fundBody,
    });
    if (!escrowProofGate.ok) {
      reply.code(escrowProofGate.statusCode);
      return escrowProofGate.body;
    }

    let fundingLockHeld = false;
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

      if (!store.tryAcquireFundingLock(params.bountyId)) {
        reply.code(409);
        return {
          error: 'funding_in_progress',
          message: 'Bounty funding is already in progress.',
        };
      }
      fundingLockHeld = true;

      const escrowReady = assertBountyFundEscrowReady(ctx.env, onchainExecutor);
      if (!escrowReady.ok) {
        reply.code(escrowReady.statusCode);
        return escrowReady.body;
      }

      const preflight = await preflightBountyFundOnchain(onchainExecutor, draft);
      if (!preflight.ok) {
        reply.code(preflight.statusCode);
        return preflight.body;
      }

      const paymentsGate = paymentsDisabledForBountyFund(ctx);
      if (!paymentsGate.ok) {
        reply.code(paymentsGate.statusCode);
        return paymentsGate.body;
      }

      if (draft.escrowJobId) {
        reply.code(409);
        return { error: 'already_funded', message: 'Bounty escrow is already funded.' };
      }

      let escrowReceiptJson = fundBody.escrowReceiptJson;
      let escrowJobId = fundBody.escrowJobId;
      if (readX402ConfigForContext(ctx).enabled) {
        const paymentResult = await prepareBountyFundPayment({
          ctx,
          bountyId: params.bountyId,
          posterWallet: access.wallet,
          draft,
          headers: request.headers,
          onchainExecutor,
          reply,
        });
        if (!paymentResult.ok) {
          reply.code(paymentResult.statusCode);
          return paymentResult.body;
        }
        escrowReceiptJson = paymentResult.prepared.escrowReceiptJson ?? escrowReceiptJson;
        escrowJobId = paymentResult.prepared.escrowJobId ?? escrowJobId;
      }

      const bounty = service.fundBounty(params.bountyId, access.wallet, {
        escrowReceiptJson,
        escrowJobId,
        openNow: fundBody.openNow,
      });
      return { bounty, onchainEscrow: Boolean(escrowJobId) };
    } catch (error) {
      if (isX402ProtocolError(error)) {
        sendX402Required(reply, error);
        return;
      }
      return mapBountyError(reply, error);
    } finally {
      if (fundingLockHeld) {
        store.releaseFundingLock(params.bountyId);
      }
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
    const access = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in access) {
      return access.error;
    }

    const params = request.params as { bountyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const awardId = typeof body.awardId === 'string' ? body.awardId : undefined;
    const award = awardId ? store.getAward(awardId) : undefined;
    if (!award || award.bountyId !== params.bountyId) {
      reply.code(404);
      return { error: 'not_found', message: 'Award not found for bounty.' };
    }
    if (award.status !== 'in_progress') {
      reply.code(409);
      return { error: 'award_not_active', message: 'Award is not active for raid execution.' };
    }

    const bounty = store.getBounty(params.bountyId);
    if (!bounty) {
      reply.code(404);
      return { error: 'not_found', message: 'Bounty not found.' };
    }

    const isPoster = access.wallet != null && bounty.posterWallet === access.wallet.toLowerCase();
    const isAwardedProvider = providerIsAuthorized(award.providerId, {
      method: request.method,
      path: request.url,
      body: request.body,
      headers: request.headers,
    });
    if (!isPoster && !isAwardedProvider) {
      reply.code(403);
      return {
        error: 'forbidden',
        message: 'Only the bounty poster or awarded provider can spawn execution raids.',
      };
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
