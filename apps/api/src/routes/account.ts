import { type FastifyInstance } from 'fastify';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import { buildSelfServeProviderRegistrationInput } from '../lib/account.js';
import { verifyProviderByHealthProbe } from '../lib/provider-verification.js';
import { readPositiveInteger, readPositiveNumber } from '../lib/env.js';
import { asSingleQueryValue } from '../lib/http.js';
import { ensureRecordInput } from '../lib/account.js';
import { serializeProviderHealth, serializeProviderProfile } from '../lib/serializers.js';
import { computeSellerModelDemand } from '../marketplace-stats.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';
import { readX402ConfigForContext } from '../lib/x402-runtime.js';
import {
  allowUnverifiedFundInDev,
  applyVerifiedFundSettlementHeaders,
  collectVerifiedFundPayment,
} from '../lib/verified-fund-payment.js';
import { buildX402SettlementFingerprint } from '../control-state/x402-settled-payments.js';
import { readPaymentSignature } from '../lib/x402-reconciliation.js';

export function registerAccountRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { orchestrator, controlState } = ctx;
  const { requirePublicSession } = handlers.auth;
  const { ensureErc8004ProofState } = handlers.raid;
  app.get('/v1/seller/providers', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    const sellerProviderIds = account?.sellerProviderIds ?? [];
    return {
      data: orchestrator
        .listProviders()
        .filter((provider) => sellerProviderIds.includes(provider.providerId))
        .map((provider) => serializeProviderProfile(provider)),
    };
  });

  app.post('/v1/seller/providers', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const input = parseProviderRegistrationInput(
      buildSelfServeProviderRegistrationInput(request.body, session.wallet)
    );
    const provider = await orchestrator.upsertRegisteredProvider(input);
    controlState.linkSellerProvider(session.wallet, provider.providerId);
    const { provider: verifiedProvider, health } = await verifyProviderByHealthProbe(
      orchestrator,
      provider,
      { controlState }
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [verifiedProvider] });
    reply.code(201);
    return {
      provider: serializeProviderProfile(verifiedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });

  app.patch('/v1/seller/providers/:providerId', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const providerId = (request.params as { providerId: string }).providerId;
    if (!controlState.sellerOwnsProvider(session.wallet, providerId)) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const input = parseProviderRegistrationInput(
      buildSelfServeProviderRegistrationInput(request.body, session.wallet, provider)
    );
    const updatedProvider = await orchestrator.upsertRegisteredProvider(input);
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return serializeProviderProfile(updatedProvider, { includeEndpoint: true });
  });

  app.post('/v1/seller/providers/:providerId/verify', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const providerId = (request.params as { providerId: string }).providerId;
    if (!controlState.sellerOwnsProvider(session.wallet, providerId)) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const provider = orchestrator.listProviders().find((item) => item.providerId === providerId);
    if (!provider) {
      reply.code(404);
      return { error: 'not_found' };
    }
    const { provider: updatedProvider, health } = await verifyProviderByHealthProbe(
      orchestrator,
      provider,
      { controlState }
    );
    await ensureErc8004ProofState({ includeMercenary: false, providers: [updatedProvider] });
    return {
      provider: serializeProviderProfile(updatedProvider, { includeEndpoint: true }),
      health: serializeProviderHealth(health, { includeDiagnostics: true, includeEndpoint: true }),
    };
  });

  app.get('/v1/seller/earnings', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    const stats = controlState.getSellerStats(account?.sellerProviderIds ?? []);
    return {
      grossUsd: stats.grossUsd,
      payoutCount: stats.payoutCount,
      earnings24hUsd: stats.earnings24hUsd,
      routedRequests24h: stats.routedRequests24h,
      payouts: stats.payouts.map((entry) => ({
        raidId: entry.raidId,
        providerId: entry.providerId,
        grossUsd: entry.grossUsd,
        status: entry.status,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      })),
    };
  });

  app.get('/v1/seller/stats', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.readPublicAccount(session.wallet);
    const sellerProviderIds = account?.sellerProviderIds ?? [];
    const stats = controlState.getSellerStats(sellerProviderIds);
    const providers = orchestrator
      .listProviders()
      .filter((provider) => sellerProviderIds.includes(provider.providerId));
    const providerViews = providers.map((provider) => ({
      providerId: provider.providerId,
      displayName: provider.displayName,
      modelId: provider.modelId,
      marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
      verificationStatus: provider.verification?.status,
    }));
    return {
      grossUsd: stats.grossUsd,
      payoutCount: stats.payoutCount,
      earnings24hUsd: stats.earnings24hUsd,
      routedRequests24h: stats.routedRequests24h,
      activeOffers: providers.filter(
        (provider) => (provider.marketplaceOfferStatus ?? 'active') === 'active'
      ).length,
      pausedOffers: providers.filter((provider) => provider.marketplaceOfferStatus === 'paused')
        .length,
      providers: providerViews,
      modelDemand: computeSellerModelDemand({
        payouts: stats.payouts,
        providers: providerViews,
      }),
    };
  });

  app.get('/v1/buyer/purchases', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const query = request.query as { limit?: unknown };
    const limit = readPositiveInteger(asSingleQueryValue(query.limit), 100);
    const purchases = controlState.listBuyerPurchases(session.wallet, limit);
    const totalSpentUsd = purchases.reduce((sum, entry) => sum + entry.costUsd, 0);
    const totalSavingsUsd = purchases.reduce((sum, entry) => sum + (entry.savingsUsd ?? 0), 0);
    return {
      object: 'list',
      totalSpentUsd,
      totalSavingsUsd,
      data: purchases,
    };
  });

  app.get('/v1/buyer/balance', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const account = controlState.ensurePublicAccount(session.wallet);
    return {
      wallet: account.wallet,
      balanceUsd: account.balanceUsd,
      currency: 'USD',
    };
  });

  app.post('/v1/buyer/balance/fund', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const body = ensureRecordInput(request.body, 'buyer_balance_fund');
    const amountRaw = body.amountUsd ?? body.amount_usd;
    const amountUsd =
      typeof amountRaw === 'number'
        ? amountRaw
        : readPositiveNumber(typeof amountRaw === 'string' ? amountRaw : undefined);
    if (amountUsd == null || amountUsd <= 0) {
      reply.code(400);
      return { error: 'invalid_amount', message: 'amountUsd must be a positive number.' };
    }

    const isProduction = ctx.env.NODE_ENV === 'production';
    const allowUnverifiedBalanceFund = allowUnverifiedFundInDev(
      ctx.env,
      'BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND'
    );
    let creditedUsd: number;
    let settlement:
      | {
          transaction?: string;
          payer?: string;
          network?: string;
        }
      | undefined;

    if (readX402ConfigForContext(ctx).enabled) {
      const payment = await collectVerifiedFundPayment({
        ctx,
        route: 'balance',
        budgetUsd: amountUsd,
        headers: request.headers,
      });
      creditedUsd = payment.escrowFundingUsd;
      settlement = payment.settlement;
      applyVerifiedFundSettlementHeaders(reply, payment.settlement);

      const fingerprint = buildX402SettlementFingerprint({
        settlementTx: payment.settlement?.transaction,
        paymentSignature: readPaymentSignature(request.headers),
      });
      if (!fingerprint || !payment.settlement?.success) {
        reply.code(402);
        return {
          error: 'payment_unverified',
          message: 'Verified x402 settlement fingerprint is required before crediting balance.',
        };
      }

      const claimResult = controlState.tryClaimX402SettledPaymentAndCredit({
        fingerprint,
        wallet: session.wallet,
        route: 'balance',
        amountUsd: creditedUsd,
        createdAt: new Date().toISOString(),
      });
      if (!claimResult.claimed) {
        return {
          wallet: session.wallet,
          balanceUsd: claimResult.balanceUsd,
          creditedUsd: 0,
          currency: 'USD',
          duplicate: true,
          ...(settlement?.transaction || settlement?.payer
            ? {
                payment: {
                  transaction: settlement.transaction,
                  payer: settlement.payer,
                  network: settlement.network,
                },
              }
            : {}),
        };
      }

      return {
        wallet: session.wallet,
        balanceUsd: claimResult.balanceUsd,
        creditedUsd,
        currency: 'USD',
        ...(settlement?.transaction || settlement?.payer
          ? {
              payment: {
                transaction: settlement.transaction,
                payer: settlement.payer,
                network: settlement.network,
              },
            }
          : {}),
      };
    } else if (allowUnverifiedBalanceFund) {
      creditedUsd = amountUsd;
    } else {
      reply.code(503);
      return {
        error: 'payments_disabled',
        message: isProduction
          ? 'Balance top-ups require x402 payments. Enable BOSSRAID_X402_ENABLED and configure facilitator credentials.'
          : 'Balance top-ups require x402 payments. Enable BOSSRAID_X402_ENABLED or set BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND=true for local development only.',
      };
    }

    const account = controlState.creditBuyerBalance(session.wallet, creditedUsd);
    return {
      wallet: account.wallet,
      balanceUsd: account.balanceUsd,
      creditedUsd,
      currency: 'USD',
    };
  });
}
