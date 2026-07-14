import { randomBytes } from 'node:crypto';
import { type FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  authNonceBodySchema,
  authNonceResponseSchema,
  authVerifyBodySchema,
  authVerifyResponseSchema,
  sessionResponseSchema,
} from '@bossraid/openapi-schemas';
import { publicRouteSchema } from '../openapi/audience.js';
import { recoverMessageAddress } from 'viem';
import {
  ensureRecordInput,
  ensureOptionalStringInput,
  ensureStringInput,
  ensurePositiveNumberInput,
  hashBuyerApiKey,
  sanitizeBuyerApiKey,
  buildPublicAuthMessage,
  readNonceFromAuthMessage,
  buildPublicAccountResponse,
} from '../lib/account.js';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { controlState, publicAuthNonceTtlSec, buyerKeyDefaultSpendLimitUsd } = ctx;
  const { readPublicAuth, requirePublicSession, issuePublicSessionCookie, clearPublicSession } =
    handlers.auth;

  app.post(
    '/v1/auth/nonce',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'Create wallet auth nonce',
        body: authNonceBodySchema,
        response: {
          200: authNonceResponseSchema,
          400: apiErrorSchema,
        },
      }),
    },
    async (request) => {
      const input = ensureRecordInput(request.body, 'auth_nonce');
      const wallet = ensureOptionalStringInput(input.wallet, 'auth_nonce.wallet')?.toLowerCase();
      const nonce = controlState.createPublicAuthNonce(wallet, publicAuthNonceTtlSec);
      return {
        nonce: nonce.nonce,
        message: buildPublicAuthMessage(nonce.nonce),
        expiresAt: new Date(nonce.expiresAt).toISOString(),
      };
    }
  );

  app.post(
    '/v1/auth/verify',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'Verify wallet signature and open session',
        body: authVerifyBodySchema,
        response: {
          200: authVerifyResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const input = ensureRecordInput(request.body, 'auth_verify');
      const message = ensureStringInput(input.message, 'auth_verify.message');
      const signature = ensureStringInput(
        input.signature,
        'auth_verify.signature'
      ) as `0x${string}`;
      const nonce = readNonceFromAuthMessage(message);
      if (!nonce) {
        reply.code(400);
        return {
          error: 'bad_request',
          message: 'Signed message is missing a Boss Raid nonce.',
        };
      }

      let wallet: string;
      try {
        wallet = (await recoverMessageAddress({ message, signature })).toLowerCase();
      } catch {
        reply.code(401);
        return {
          error: 'unauthorized',
          message: 'Wallet signature could not be verified.',
        };
      }

      const consumed = controlState.consumePublicAuthNonce(nonce, wallet);
      if (!consumed) {
        reply.code(401);
        return {
          error: 'unauthorized',
          message: 'Auth nonce is invalid or expired.',
        };
      }

      const session = issuePublicSessionCookie(reply, wallet);
      return {
        authenticated: true,
        wallet,
        expiresAt: new Date(session.expiresAt).toISOString(),
        account: buildPublicAccountResponse(controlState, wallet),
      };
    }
  );

  app.get(
    '/v1/session',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'Read current public session',
        response: {
          200: sessionResponseSchema,
        },
      }),
    },
    async (request) => {
      const auth = readPublicAuth(request.headers);
      if (!auth) {
        return {
          authenticated: false,
        };
      }

      return {
        authenticated: true,
        wallet: auth.wallet,
        authType: auth.type,
        account: buildPublicAccountResponse(controlState, auth.wallet),
      };
    }
  );

  app.delete(
    '/v1/session',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'Clear public session',
        response: {
          200: sessionResponseSchema,
        },
      }),
    },
    async (request, reply) => {
      clearPublicSession(reply, request.headers);
      return {
        authenticated: false,
      };
    }
  );

  app.get(
    '/v1/buyer/api-keys',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'List buyer API keys',
        response: {
          200: { type: 'object', additionalProperties: true },
          401: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const session = requirePublicSession(reply, request.headers);
      if ('error' in session) {
        return session;
      }
      return {
        data: controlState.listBuyerApiKeys(session.wallet).map((key) => sanitizeBuyerApiKey(key)),
      };
    }
  );

  app.post(
    '/v1/buyer/api-keys',
    {
      schema: publicRouteSchema({
        tags: ['Auth'],
        summary: 'Create buyer API key',
        response: {
          201: { type: 'object', additionalProperties: true },
          401: apiErrorSchema,
        },
      }),
    },
    async (request, reply) => {
      const session = requirePublicSession(reply, request.headers);
      if ('error' in session) {
        return session;
      }
      const input = ensureRecordInput(request.body, 'buyer_api_key');
      const name = ensureOptionalStringInput(input.name, 'buyer_api_key.name') ?? 'Default key';
      const defaultLimit = Math.max(buyerKeyDefaultSpendLimitUsd ?? 25, 1);
      const requestedSpendLimit =
        input.spendLimitUsd == null && input.spend_limit_usd == null
          ? defaultLimit
          : Math.min(
              defaultLimit,
              Math.max(
                1,
                ensurePositiveNumberInput(
                  input.spendLimitUsd ?? input.spend_limit_usd,
                  'buyer_api_key.spend_limit_usd'
                )
              )
            );
      const rawKey = `br_${randomBytes(24).toString('base64url')}`;
      const key = controlState.createBuyerApiKey({
        wallet: session.wallet,
        name,
        keyHash: hashBuyerApiKey(rawKey),
        prefix: rawKey.slice(0, 10),
        spendLimitUsd: requestedSpendLimit,
      });
      reply.code(201);
      return {
        apiKey: rawKey,
        key: sanitizeBuyerApiKey(key),
      };
    }
  );

  app.delete('/v1/buyer/api-keys/:keyId', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const keyId = (request.params as { keyId: string }).keyId;
    const revoked = controlState.revokeBuyerApiKey(session.wallet, keyId);
    if (!revoked) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { revoked: true };
  });

  app.patch('/v1/buyer/api-keys/:keyId', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const keyId = (request.params as { keyId: string }).keyId;
    const input = ensureRecordInput(request.body, 'buyer_api_key');
    const spendLimitUsd = Math.max(
      1,
      ensurePositiveNumberInput(
        input.spendLimitUsd ?? input.spend_limit_usd,
        'buyer_api_key.spend_limit_usd'
      )
    );

    const existing = controlState
      .listBuyerApiKeys(session.wallet)
      .find((key) => key.id === keyId && key.status === 'active');
    if (!existing) {
      reply.code(404);
      return { error: 'not_found' };
    }

    if (spendLimitUsd < existing.spentUsd) {
      reply.code(400);
      return {
        error: 'spend_limit_below_spent',
        message: 'API key spend limit cannot be lower than amount already spent.',
      };
    }

    const updated = controlState.updateBuyerApiKeySpendLimit(session.wallet, keyId, spendLimitUsd);
    if (!updated) {
      reply.code(404);
      return { error: 'not_found' };
    }

    return {
      key: sanitizeBuyerApiKey(updated),
    };
  });

  app.post('/v1/auth/agent-session', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const input = ensureRecordInput(request.body, 'agent_session');
    const sessionAccount = ensureStringInput(input.sessionAccount, 'agent_session.sessionAccount');
    const permissionFrom = ensureStringInput(input.permissionFrom, 'agent_session.permissionFrom');
    const permissionContext = ensureStringInput(
      input.permissionContext,
      'agent_session.permissionContext'
    );
    const expiresAt = ensureStringInput(input.expiresAt, 'agent_session.expiresAt');
    const weeklyBudgetUsd =
      typeof input.weeklyBudgetUsd === 'number' && Number.isFinite(input.weeklyBudgetUsd)
        ? input.weeklyBudgetUsd
        : undefined;

    const grant = controlState.upsertAgentPaymentSession({
      wallet: session.wallet,
      sessionAccount: sessionAccount.toLowerCase(),
      permissionFrom: permissionFrom.toLowerCase(),
      permissionContext,
      grantedAt: new Date().toISOString(),
      expiresAt,
      weeklyBudgetUsd,
    });

    return { grant };
  });

  app.get('/v1/auth/agent-session', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    const grant = controlState.getAgentPaymentSession(session.wallet);
    if (!grant) {
      reply.code(404);
      return { error: 'not_found', message: 'No agent payment session is stored for this wallet.' };
    }

    return { grant };
  });

  app.delete('/v1/auth/agent-session', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }

    controlState.deleteAgentPaymentSession(session.wallet);
    return { revoked: true };
  });
}
