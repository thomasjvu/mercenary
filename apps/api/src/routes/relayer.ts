import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_ONESHOT_RELAYER_URL,
  estimate7710Transaction,
  getRelayerCapabilities,
  getRelayerFeeData,
  getRelayerStatus,
  readRelayerTaskId,
  send7710Transaction,
} from '@bossraid/oneshot-relayer';
import type { ApiContext } from '../api-context.js';

function readRelayerUrl(env: NodeJS.ProcessEnv): string {
  return env.BOSSRAID_ONESHOT_RELAYER_URL ?? DEFAULT_ONESHOT_RELAYER_URL;
}

export function registerRelayerRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const relayerUrl = readRelayerUrl(ctx.env);

  app.get('/v1/relayer/capabilities/:chainId', async (request) => {
    const chainId = (request.params as { chainId: string }).chainId;
    return getRelayerCapabilities(relayerUrl, chainId);
  });

  app.post('/v1/relayer/fee-data', async (request, reply) => {
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

  app.post('/v1/relayer/estimate', async (request) => {
    const bundle = (request.body ?? {}) as Record<string, unknown>;
    return estimate7710Transaction(relayerUrl, bundle);
  });

  app.post('/v1/relayer/send', async (request, reply) => {
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

  app.get('/v1/relayer/status/:taskId', async (request) => {
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
