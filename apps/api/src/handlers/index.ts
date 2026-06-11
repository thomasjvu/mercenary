import { type ApiContext } from '../api-context.js';
import { createAuthHandlers } from './auth.js';
import { createManaBillingHandlers } from './billing-mana.js';
import { createPaymentHandlers } from './payment.js';
import { createRaidHandlers } from './raid.js';
import { createChatHandlers } from './chat.js';

export function createApiHandlers(ctx: ApiContext) {
  const auth = createAuthHandlers(ctx);
  const manaBilling = createManaBillingHandlers(ctx);
  const payment = createPaymentHandlers(ctx, auth, manaBilling);
  const raid = createRaidHandlers(ctx, auth, payment);
  const chat = createChatHandlers(ctx, auth, manaBilling, payment, raid);

  return {
    providerIsAuthorized: auth.providerIsAuthorized,
    registryIsAuthorized: auth.registryIsAuthorized,
    adminIsAuthorized: auth.adminIsAuthorized,
    readPublicAuth: auth.readPublicAuth,
    requirePublicSession: auth.requirePublicSession,
    readBuyerApiKey: auth.readBuyerApiKey,
    requireAdmin: auth.requireAdmin,
    requireDemoRouteAccess: auth.requireDemoRouteAccess,
    requireRateLimit: auth.requireRateLimit,
    requireBuyerApiKeyRateLimit: auth.requireBuyerApiKeyRateLimit,
    requireRaidReadAccess: auth.requireRaidReadAccess,
    readRaidAccessTokenQuery: auth.readRaidAccessTokenQuery,
    serializeProviderProfile: raid.serializeProviderProfile,
    requireProviderOrRaidReadAccess: auth.requireProviderOrRaidReadAccess,
    buildProviderSettlementPayload: raid.buildProviderSettlementPayload,
    ensureErc8004ProofState: raid.ensureErc8004ProofState,
    ensureSettlementProofState: raid.ensureSettlementProofState,
    serializeProviderHealth: raid.serializeProviderHealth,
    buildInferenceMarketSnapshot: raid.buildInferenceMarketSnapshot,
    handleChatCompletionRequest: chat.handleChatCompletionRequest,
    readOpsSession: auth.readOpsSession,
    readPublicSession: auth.readPublicSession,
    issueOpsSession: auth.issueOpsSession,
    clearOpsSession: auth.clearOpsSession,
    issuePublicSessionCookie: auth.issuePublicSessionCookie,
    clearPublicSession: auth.clearPublicSession,
    validateProviderCallback: raid.validateProviderCallback,
    getRaidId: raid.getRaidId,
    recordMarketplaceLedgersFromRaid: payment.recordMarketplaceLedgersFromRaid,
    spawnParsedRaid: raid.spawnParsedRaid,
    registerRaidDetailRoutes: raid.registerRaidDetailRoutes,
    collectProviderHealth: raid.collectProviderHealth,
  };
}

export type ApiHandlers = ReturnType<typeof createApiHandlers>;
