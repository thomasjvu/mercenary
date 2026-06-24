import { type FastifyInstance } from 'fastify';
import {
  apiErrorSchema,
  chatCompletionBodySchema,
  chatCompletionResponseSchema,
} from '@bossraid/openapi-schemas';
import { type ApiContext } from '../api-context.js';
import { type ApiHandlerGroups } from '../handlers/index.js';
import { publicRouteSchema } from '../openapi/audience.js';

export function registerChatRoutes(
  app: FastifyInstance,
  _ctx: ApiContext,
  handlers: ApiHandlerGroups
): void {
  const { handleChatCompletionRequest } = handlers.chat;

  const chatRouteSchema = publicRouteSchema({
    tags: ['Chat'],
    summary: 'OpenAI-compatible chat completion',
    body: chatCompletionBodySchema,
    response: {
      200: chatCompletionResponseSchema,
      400: apiErrorSchema,
      401: apiErrorSchema,
      402: apiErrorSchema,
      409: apiErrorSchema,
      503: apiErrorSchema,
    },
  });

  app.post(
    '/v1/inference/chat/completions',
    {
      schema: {
        ...chatRouteSchema,
        summary: 'Discount inference chat completion',
      },
    },
    async (request, reply) =>
      handleChatCompletionRequest(request, reply, { discountInference: true })
  );

  app.post('/v1/chat/completions', { schema: chatRouteSchema }, async (request, reply) =>
    handleChatCompletionRequest(request, reply)
  );
}
