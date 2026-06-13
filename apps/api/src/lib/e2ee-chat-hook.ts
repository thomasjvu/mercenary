import { type FastifyReply, type FastifyRequest } from 'fastify';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { ChatCompletionRequest } from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import { executeE2eeChatRelay } from './e2ee-chat-relay.js';
import type { InferenceReceiptStore } from './inference-receipt-store.js';

export type ChatE2eeRoute = {
  enabled: true;
  modelId: string;
  upstreamModelId: string;
  attestationVendor: string;
};

export function resolveChatE2eeRoute(
  chatRequest: ChatCompletionRequest
): ChatE2eeRoute | undefined {
  const privacyMode = chatRequest.raidPolicy?.privacyMode === 'strict' ? 'strict' : undefined;
  if (privacyMode !== 'strict') {
    return undefined;
  }

  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === chatRequest.model);
  if (!catalogEntry?.e2ee) {
    return undefined;
  }

  return {
    enabled: true,
    modelId: catalogEntry.modelId,
    upstreamModelId: catalogEntry.upstreamModelId ?? catalogEntry.modelId,
    attestationVendor: catalogEntry.attestationVendor ?? catalogEntry.modelProvider ?? 'venice',
  };
}

export async function runServerE2eeChatCompletion(input: {
  chatRequest: ChatCompletionRequest;
  route: ChatE2eeRoute;
  request: FastifyRequest;
  reply: FastifyReply;
  controlState: ApiControlState;
  inferenceReceiptStore: InferenceReceiptStore;
  env: NodeJS.ProcessEnv;
  created: number;
}) {
  try {
    return await executeE2eeChatRelay(input);
  } catch (error) {
    input.reply.code(400);
    return {
      error: 'e2ee_relay_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
