import { randomBytes } from 'node:crypto';
import { type FastifyInstance } from 'fastify';
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
import { type ApiHandlers } from '../api-handlers.js';

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlers
): void {
  const { controlState, publicAuthNonceTtlSec, buyerKeyDefaultSpendLimitUsd } = ctx;
  const { readPublicAuth, requirePublicSession, issuePublicSessionCookie, clearPublicSession } =
    handlers;

  app.post('/v1/auth/nonce', async (request) => {
    const input = ensureRecordInput(request.body, 'auth_nonce');
    const wallet = ensureOptionalStringInput(input.wallet, 'auth_nonce.wallet')?.toLowerCase();
    const nonce = controlState.createPublicAuthNonce(wallet, publicAuthNonceTtlSec);
    return {
      nonce: nonce.nonce,
      message: buildPublicAuthMessage(nonce.nonce),
      expiresAt: new Date(nonce.expiresAt).toISOString(),
    };
  });

  app.post('/v1/auth/verify', async (request, reply) => {
    const input = ensureRecordInput(request.body, 'auth_verify');
    const message = ensureStringInput(input.message, 'auth_verify.message');
    const signature = ensureStringInput(input.signature, 'auth_verify.signature') as `0x${string}`;
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
  });

  app.get('/v1/session', async (request) => {
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
  });

  app.delete('/v1/session', async (request, reply) => {
    clearPublicSession(reply, request.headers);
    return {
      authenticated: false,
    };
  });

  app.get('/v1/buyer/api-keys', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    return {
      data: controlState.listBuyerApiKeys(session.wallet).map((key) => sanitizeBuyerApiKey(key)),
    };
  });

  app.post('/v1/buyer/api-keys', async (request, reply) => {
    const session = requirePublicSession(reply, request.headers);
    if ('error' in session) {
      return session;
    }
    const input = ensureRecordInput(request.body, 'buyer_api_key');
    const name = ensureOptionalStringInput(input.name, 'buyer_api_key.name') ?? 'Default key';
    const requestedSpendLimit =
      input.spendLimitUsd == null && input.spend_limit_usd == null
        ? buyerKeyDefaultSpendLimitUsd
        : ensurePositiveNumberInput(
            input.spendLimitUsd ?? input.spend_limit_usd,
            'buyer_api_key.spend_limit_usd'
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
  });

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
}
