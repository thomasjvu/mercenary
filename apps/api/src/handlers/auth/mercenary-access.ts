import { type FastifyReply } from 'fastify';
import { type createAuthHandlers } from '../auth.js';
import { type createManaBillingHandlers } from '../billing-mana.js';

export function requireMercenaryAccess(
  reply: FastifyReply,
  headers: Record<string, string | string[] | undefined>,
  auth: Pick<
    ReturnType<typeof createAuthHandlers>,
    'adminIsAuthorized' | 'readBuyerApiKey' | 'requirePublicSession'
  >,
  manaBilling: Pick<ReturnType<typeof createManaBillingHandlers>, 'readManaBillingHeaders'>
): { wallet?: string } | { error: Record<string, unknown> } {
  if (auth.adminIsAuthorized(headers)) {
    return {};
  }

  if (auth.readBuyerApiKey(headers)) {
    return {};
  }

  try {
    if (manaBilling.readManaBillingHeaders(headers)) {
      return {};
    }
  } catch {
    // Partial mana billing headers fall through to public session requirement.
  }

  const session = auth.requirePublicSession(reply, headers);
  if ('error' in session) {
    reply.code(401);
    return {
      error: {
        error: 'unauthorized',
        message: 'Sign in required before launching Mercenary requests.',
      },
    };
  }

  return { wallet: session.wallet };
}
