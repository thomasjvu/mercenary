import { type FastifyReply } from 'fastify';
import { asSingleHeader } from '@bossraid/shared-types';
import { hashBuyerApiKey } from '../../lib/account.js';
import { type ApiContext } from '../../api-context.js';

export type PublicAuth =
  | { type: 'session'; wallet: string; token: string }
  | {
      type: 'api_key';
      wallet: string;
      apiKeyId: string;
      spendLimitUsd?: number;
      spentUsd: number;
    };

export function createBuyerAuth(
  ctx: ApiContext,
  readPublicSession: (
    headers: Record<string, string | string[] | undefined>
  ) => { token: string; wallet: string; expiresAt: number } | undefined
) {
  function readBuyerApiKey(headers: Record<string, string | string[] | undefined>) {
    const authorization = asSingleHeader(headers.authorization);
    if (!authorization?.startsWith('Bearer br_')) {
      return undefined;
    }
    return ctx.controlState.readActiveBuyerApiKeyByHash(hashBuyerApiKey(authorization.slice(7)));
  }

  function readPublicAuth(
    headers: Record<string, string | string[] | undefined>
  ): PublicAuth | undefined {
    const apiKey = readBuyerApiKey(headers);
    if (apiKey) {
      return {
        type: 'api_key',
        wallet: apiKey.wallet,
        apiKeyId: apiKey.id,
        spendLimitUsd: apiKey.spendLimitUsd,
        spentUsd: apiKey.spentUsd,
      };
    }

    const publicSession = readPublicSession(headers);
    return publicSession
      ? {
          type: 'session',
          wallet: publicSession.wallet,
          token: publicSession.token,
        }
      : undefined;
  }

  function requirePublicSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): { wallet: string; token: string } | { error: 'unauthorized' } {
    const publicSession = readPublicSession(headers);
    if (!publicSession) {
      reply.code(401);
      return { error: 'unauthorized' };
    }
    return {
      wallet: publicSession.wallet,
      token: publicSession.token,
    };
  }

  return {
    readBuyerApiKey,
    readPublicAuth,
    requirePublicSession,
  };
}
