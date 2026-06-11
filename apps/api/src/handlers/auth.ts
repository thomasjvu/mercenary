import { type ApiContext } from '../api-context.js';
import { createBuyerAuth } from './auth/buyer-auth.js';
import { createProviderAuth } from './auth/provider-auth.js';
import { createRateLimitAuth } from './auth/rate-limits.js';
import { createRouteAccessAuth } from './auth/route-access.js';
import { createSessionAuth } from './auth/sessions.js';

export function createAuthHandlers(ctx: ApiContext) {
  const sessions = createSessionAuth(ctx);
  const rateLimits = createRateLimitAuth(ctx);
  const providerAuth = createProviderAuth(ctx);
  const buyerAuth = createBuyerAuth(ctx, sessions.readPublicSession);
  const routeAccess = createRouteAccessAuth(
    ctx,
    sessions.readOpsSession,
    providerAuth.providerIsAuthorized
  );

  return {
    ...sessions,
    ...rateLimits,
    ...providerAuth,
    ...buyerAuth,
    ...routeAccess,
  };
}
