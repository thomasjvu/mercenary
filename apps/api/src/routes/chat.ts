import { type FastifyInstance } from 'fastify';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../api-handlers.js';

export function registerChatRoutes(
  app: FastifyInstance,
  _ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { handleChatCompletionRequest } = handlers.chat;

  app.post('/v1/inference/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply, { discountInference: true })
  );

  app.post('/v1/chat/completions', async (request, reply) =>
    handleChatCompletionRequest(request, reply)
  );
}
