import { type FastifyReply, type FastifyRequest } from 'fastify';
import { streamDirectChatCompletionResponse } from '../lib/chat-completion.js';
import {
  applyMercenaryPlannerRaidRequest,
  authorizeChatCompletionRequest,
  deliverBufferedChatCompletion,
  deliverStreamingChatCompletion,
  launchPaidChatRaid,
  prepareChatCompletionRequest,
  tryMercenaryPlannerDirectResponse,
  type ChatCompletionPipelineDeps,
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

  async function handleChatCompletionRequest(request: FastifyRequest, reply: FastifyReply) {
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

    const prepared = prepareChatCompletionRequest(request, pipelineDeps);
    const authorization = authorizeChatCompletionRequest(
      request,
      reply,
      pipelineDeps,
      prepared.raidRequest
    );
    if ('error' in authorization) {
      return authorization.error;
    }

    const plannerResult = await tryMercenaryPlannerDirectResponse(
      prepared.chatRequest,
      prepared.created,
      pipelineDeps.ctx.env
    );
    if (plannerResult?.response) {
      if (prepared.chatRequest.stream) {
        await streamDirectChatCompletionResponse(reply, plannerResult.response);
        return;
      }

      return plannerResult.response;
    }

    const raidRequest = applyMercenaryPlannerRaidRequest(
      prepared.raidRequest,
      plannerResult?.decision ?? { action: 'raid' }
    );

    const { launchPayment, spawn } = await launchPaidChatRaid(
      {
        request,
        raidRequest,
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
          raidRequest,
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
        raidRequest,
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
