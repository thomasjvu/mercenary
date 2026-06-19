import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DEFAULT_ONESHOT_RELAYER_URL,
  estimate7710Transaction,
  getRelayerCapabilities,
  getRelayerFeeData,
  getRelayerStatus,
  readRelayerTaskId,
  send7710Transaction,
} from '@bossraid/oneshot-relayer';
import { asSingleHeader } from '@bossraid/shared-types';
import { safeEqualString } from '../lib/http.js';
import type { ApiContext } from '../api-context.js';
import type { ApiHandlerGroups } from '../handlers/index.js';
import { requireMercenaryAccess } from '../handlers/auth/mercenary-access.js';

const RELAYER_WEBHOOK_SECRET_HEADER = 'x-bossraid-relayer-webhook-secret';

function readRelayerUrl(env: NodeJS.ProcessEnv): string {
  return env.BOSSRAID_ONESHOT_RELAYER_URL ?? DEFAULT_ONESHOT_RELAYER_URL;
}

function readRelayerWebhookSecret(env: NodeJS.ProcessEnv): string | undefined {
  return env.BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET?.trim() || undefined;
}

function isRelayerWebhookAuthRequired(env: NodeJS.ProcessEnv): boolean {
  if (readRelayerWebhookSecret(env)) {
    return true;
  }
  return env.NODE_ENV === 'production';
}

function verifyRelayerWebhookSecret(
  env: NodeJS.ProcessEnv,
  headers: Record<string, string | string[] | undefined>
): boolean {
  const secret = readRelayerWebhookSecret(env);
  if (!secret) {
    return !isRelayerWebhookAuthRequired(env);
  }
  const provided =
    asSingleHeader(headers[RELAYER_WEBHOOK_SECRET_HEADER]) ??
    asSingleHeader(headers.authorization)?.replace(/^Bearer\s+/i, '');
  return Boolean(provided && safeEqualString(provided, secret));
}

export function registerRelayerRoutes(
  app: FastifyInstance,
  ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const relayerUrl = readRelayerUrl(ctx.env);
  const { requireRateLimit } = handlers.auth;

  function applyRelayerRateLimit(request: FastifyRequest, reply: FastifyReply) {
    return requireRateLimit(
      request,
      reply,
      'relayer',
      ctx.publicRateLimitMax,
      ctx.publicRateLimitWindowMs
    );
  }

  app.get('/v1/relayer/capabilities/:chainId', async (request, reply) => {
    const rateLimitError = applyRelayerRateLimit(request, reply);
    if (rateLimitError) {
      return rateLimitError;
    }
    const chainId = (request.params as { chainId: string }).chainId;
    return getRelayerCapabilities(relayerUrl, chainId);
  });

  app.post('/v1/relayer/fee-data', async (request, reply) => {
    const rateLimitError = applyRelayerRateLimit(request, reply);
    if (rateLimitError) {
      return rateLimitError;
    }
    const accessError = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in accessError) {
      return accessError.error;
    }

    const body = request.body as { chainId?: unknown; token?: unknown };
    if (typeof body?.chainId !== 'string' && typeof body?.chainId !== 'number') {
      reply.code(400);
      return { error: 'bad_request', message: 'chainId is required.' };
    }
    if (typeof body?.token !== 'string' || body.token.length === 0) {
      reply.code(400);
      return { error: 'bad_request', message: 'token is required.' };
    }

    return getRelayerFeeData(relayerUrl, {
      chainId: body.chainId,
      token: body.token,
    });
  });

  app.post('/v1/relayer/estimate', async (request, reply) => {
    const rateLimitError = applyRelayerRateLimit(request, reply);
    if (rateLimitError) {
      return rateLimitError;
    }
    const accessError = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in accessError) {
      return accessError.error;
    }

    const bundle = (request.body ?? {}) as Record<string, unknown>;
    return estimate7710Transaction(relayerUrl, bundle);
  });

  app.post('/v1/relayer/send', async (request, reply) => {
    const rateLimitError = applyRelayerRateLimit(request, reply);
    if (rateLimitError) {
      return rateLimitError;
    }
    const accessError = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in accessError) {
      return accessError.error;
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const result = await send7710Transaction(relayerUrl, body);
    const taskId = readRelayerTaskId(result);
    if (!taskId) {
      reply.code(502);
      return { error: 'relayer_error', message: '1Shot relayer did not return a task id.' };
    }

    const now = new Date().toISOString();
    ctx.controlState.upsertRelayerTask({
      taskId,
      wallet: typeof body.wallet === 'string' ? body.wallet.toLowerCase() : undefined,
      raidId: typeof body.raidId === 'string' ? body.raidId : undefined,
      status: 'Pending',
      createdAt: now,
      updatedAt: now,
      memo: typeof body.memo === 'string' ? body.memo : undefined,
    });

    return { taskId, status: 'Pending' };
  });

  app.get('/v1/relayer/status/:taskId', async (request, reply) => {
    const rateLimitError = applyRelayerRateLimit(request, reply);
    if (rateLimitError) {
      return rateLimitError;
    }
    const accessError = requireMercenaryAccess(
      reply,
      request.headers,
      handlers.auth,
      handlers.manaBilling
    );
    if ('error' in accessError) {
      return accessError.error;
    }

    const taskId = (request.params as { taskId: string }).taskId;
    const cached = ctx.controlState.getRelayerTask(taskId);
    const status = await getRelayerStatus(relayerUrl, taskId);
    const now = new Date().toISOString();

    ctx.controlState.upsertRelayerTask({
      taskId,
      wallet: cached?.wallet,
      raidId: cached?.raidId,
      status: status.status,
      transactionHash: status.transactionHash ?? cached?.transactionHash,
      createdAt: cached?.createdAt ?? now,
      updatedAt: now,
      memo: cached?.memo,
    });

    return status;
  });

  app.post('/v1/relayer/webhook', async (request, reply) => {
    if (!verifyRelayerWebhookSecret(ctx.env, request.headers)) {
      reply.code(401);
      return { error: 'unauthorized', message: 'Invalid relayer webhook secret.' };
    }

    const body = request.body as {
      taskId?: unknown;
      status?: unknown;
      transactionHash?: unknown;
      txHash?: unknown;
      wallet?: unknown;
      raidId?: unknown;
    };

    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined;
    if (!taskId) {
      reply.code(400);
      return { error: 'bad_request', message: 'taskId is required.' };
    }

    const cached = ctx.controlState.getRelayerTask(taskId);
    const now = new Date().toISOString();
    ctx.controlState.upsertRelayerTask({
      taskId,
      wallet: typeof body.wallet === 'string' ? body.wallet.toLowerCase() : cached?.wallet,
      raidId: typeof body.raidId === 'string' ? body.raidId : cached?.raidId,
      status: typeof body.status === 'string' ? body.status : (cached?.status ?? 'Pending'),
      transactionHash:
        typeof body.transactionHash === 'string'
          ? body.transactionHash
          : typeof body.txHash === 'string'
            ? body.txHash
            : cached?.transactionHash,
      createdAt: cached?.createdAt ?? now,
      updatedAt: now,
      memo: cached?.memo,
    });

    return { ok: true, taskId };
  });
}
