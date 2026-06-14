import { type FastifyInstance } from 'fastify';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import { probeRegisteredProviderHealth } from '../lib/provider-health.js';
import {
  buildSelfServeProviderRegistrationInput,
  buildProviderVerificationFromHealth,
  buildProviderVerificationRegistrationInput,
} from '../lib/account.js';
import { readPositiveInteger, readPositiveNumber } from '../lib/env.js';
import { asSingleQueryValue } from '../lib/http.js';
import { ensureRecordInput } from '../lib/account.js';
import { serializeProviderHealth, serializeProviderProfile } from '../lib/serializers.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

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
    const health = await probeRegisteredProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const verifiedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
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
    const health = await probeRegisteredProviderHealth(provider);
    const verification = buildProviderVerificationFromHealth(provider, health);
    const updatedProvider = await orchestrator.upsertRegisteredProvider(
      buildProviderVerificationRegistrationInput(provider, verification)
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
      providers: providers.map((provider) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        modelId: provider.modelId,
        marketplaceOfferStatus: provider.marketplaceOfferStatus ?? 'active',
        verificationStatus: provider.verification?.status,
      })),
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
    const account = controlState.creditBuyerBalance(session.wallet, amountUsd);
    return {
      wallet: account.wallet,
      balanceUsd: account.balanceUsd,
      creditedUsd: amountUsd,
      currency: 'USD',
    };
  });
}
