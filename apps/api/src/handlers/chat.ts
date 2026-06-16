import { type FastifyReply, type FastifyRequest } from 'fastify';
import { streamDirectChatCompletionResponse } from '../lib/chat-completion.js';
import {
  authorizeChatCompletionRequest,
  deliverBufferedChatCompletion,
  deliverStreamingChatCompletion,
  launchPaidChatRaid,
  prepareChatCompletionRequest,
  tryDirectChatCompletionResponse,
  tryE2eeChatRelay,
  type ChatCompletionPipelineDeps,
  type ChatCompletionRouteOptions,
} from '../lib/chat-completion-pipeline.js';
import { type ApiContext } from '../api-context.js';
import { requireMercenaryAccess } from './auth/mercenary-access.js';
import { createAuthHandlers } from './auth.js';
import { createManaBillingHandlers } from './billing-mana.js';
import { createPaymentHandlers } from './payment.js';
import { createRaidHandlers } from './raid.js';

export function createChatHandlers(
  ctx: ApiContext,
  auth: ReturnType<typeof createAuthHandlers>,
  manaBilling: ReturnType<typeof createManaBillingHandlers>,
  payment: ReturnType<typeof createPaymentHandlers>,
  raid: ReturnType<typeof createRaidHandlers>
) {
  const { requireRateLimit } = auth;
  const pipelineDeps: ChatCompletionPipelineDeps = {
    ctx,
    auth,
    manaBilling,
    payment,
    raid,
  };

  async function handleChatCompletionRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options: ChatCompletionRouteOptions = {}
  ) {
    const rateLimitError = requireRateLimit(
      request,
      reply,
      'public-action',
      ctx.publicRateLimitMax,
      ctx.publicRateLimitWindowMs
    );
    if (rateLimitError) {
      return rateLimitError;
    }

    const accessError = requireMercenaryAccess(reply, request.headers, auth, manaBilling);
    if ('error' in accessError) {
      return accessError.error;
    }

    const prepared = prepareChatCompletionRequest(request, pipelineDeps, options);
    if (prepared.e2eeRoute) {
      return tryE2eeChatRelay(
        {
          chatRequest: prepared.chatRequest,
          route: prepared.e2eeRoute,
          request,
          reply,
          created: prepared.created,
        },
        pipelineDeps
      );
    }

    if (!prepared.raidRequest) {
      throw new Error('Chat completion request is missing raid routing context.');
    }

    const authorization = authorizeChatCompletionRequest(
      request,
      reply,
      pipelineDeps,
      prepared.raidRequest
    );
    if ('error' in authorization) {
      return authorization.error;
    }

    const directResponse = tryDirectChatCompletionResponse(
      prepared.chatRequest,
      prepared.created,
      options
    );
    if (directResponse) {
      if (prepared.chatRequest.stream) {
        await streamDirectChatCompletionResponse(reply, directResponse);
        return;
      }

      return directResponse;
    }

    const { launchPayment, spawn } = await launchPaidChatRaid(
      {
        request,
        raidRequest: prepared.raidRequest,
        paymentRoute: prepared.paymentRoute,
      },
      pipelineDeps
    );

    if (prepared.chatRequest.stream) {
      await deliverStreamingChatCompletion(
        {
          request,
          reply,
          chatRequest: prepared.chatRequest,
          raidRequest: prepared.raidRequest,
          spawn,
          created: prepared.created,
          launchPayment,
          publicAuth: authorization.publicAuth,
        },
        pipelineDeps
      );
      return;
    }

    return deliverBufferedChatCompletion(
      {
        request,
        reply,
        chatRequest: prepared.chatRequest,
        raidRequest: prepared.raidRequest,
        spawn,
        created: prepared.created,
        launchPayment,
        publicAuth: authorization.publicAuth,
        paymentRoute: prepared.paymentRoute,
      },
      pipelineDeps
    );
  }

  return {
    handleChatCompletionRequest,
  };
}
