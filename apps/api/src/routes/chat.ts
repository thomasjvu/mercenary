import { type FastifyInstance } from 'fastify';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlers } from '../api-handlers.js';

export function registerChatRoutes(
  app: FastifyInstance,
  _ctx: ApiContext,
  handlers: ApiHandlers
): void {
  const { handleChatCompletionRequest } = handlers;

  app.post('/v1/inference/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply, { discountInference: true })
  );

  app.post('/v1/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply)
  );
}
