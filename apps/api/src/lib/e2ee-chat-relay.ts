import { randomUUID } from 'node:crypto';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { isUpstreamProviderId } from '@bossraid/constants';
import { decryptChunk, decryptE2eeStream } from '@bossraid/privacy-engine';
import type { ChatCompletionRequest, TeeAttestationResult } from '@bossraid/shared-types';
import { asSingleHeader } from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import { buildInferenceReceipt } from './attestation-service.js';
import { buildCatalogProviderId, readPlatformUpstreamApiKey } from './upstream/credentials.js';
import type { ChatE2eeRoute } from './e2ee-chat-hook.js';
import type { InferenceReceiptStore } from './inference-receipt-store.js';
import { isProviderInferenceMock, mockVeniceE2eeContent } from './upstream-mock.js';
import {
  fetchVeniceE2eeChatCompletion,
  requireVeniceE2eeAttestation,
  type VeniceE2eeSession,
} from './venice-e2ee.js';

function readUpstreamApiKey(
  request: FastifyRequest,
  controlState: ApiControlState,
  provider: string,
  env: NodeJS.ProcessEnv
): string | undefined {
  const headerKey =
    asSingleHeader(request.headers['x-bossraid-upstream-api-key']) ??
    asSingleHeader(request.headers['x-venice-api-key']) ??
    asSingleHeader(request.headers['x-upstream-api-key']);

  if (headerKey?.trim()) {
    return headerKey.trim();
  }

  const platformKey = readPlatformUpstreamApiKey(provider, env);
  if (platformKey) {
    return platformKey;
  }

  const authHeader = asSingleHeader(request.headers.authorization);
  if (authHeader?.startsWith('Bearer br_')) {
    // Buyer API keys do not carry upstream credentials; fall through.
  }

  return undefined;
}

function estimateUsage(messages: ChatCompletionRequest['messages'], content: string) {
  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const completionChars = content.length;
  return {
    prompt_tokens: Math.max(1, Math.ceil(promptChars / 4)),
    completion_tokens: Math.max(1, Math.ceil(completionChars / 4)),
    total_tokens: Math.max(2, Math.ceil((promptChars + completionChars) / 4)),
  };
}

function buildE2eeCompletionResponse(
  chatRequest: ChatCompletionRequest,
  content: string,
  created: number,
  attestation: { signingAddress?: string; explorerUrl?: string },
  receiptId?: string
) {
  return {
    id: `chatcmpl_e2ee_${randomUUID()}`,
    object: 'chat.completion',
    created,
    model: chatRequest.model,
    system_fingerprint: 'mercenary-v1-e2ee',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content,
        },
        finish_reason: 'stop' as const,
      },
    ],
    usage: estimateUsage(chatRequest.messages, content),
    privacy: {
      mode: 'strict',
      transport: 'venice-e2ee',
      teeSigningAddress: attestation.signingAddress,
      explorerUrl: attestation.explorerUrl,
      receiptId,
    },
  };
}

function buildStreamPrivacyChunk(
  completionId: string,
  chatRequest: ChatCompletionRequest,
  created: number,
  attestation: { signingAddress?: string; explorerUrl?: string },
  receiptId: string
) {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model: chatRequest.model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    privacy: {
      mode: 'strict',
      transport: 'venice-e2ee',
      teeSigningAddress: attestation.signingAddress,
      explorerUrl: attestation.explorerUrl,
      receiptId,
    },
  };
}

async function streamE2eeCompletion(input: {
  reply: FastifyReply;
  chatRequest: ChatCompletionRequest;
  response: Response;
  session: VeniceE2eeSession;
  created: number;
  attestation: TeeAttestationResult;
  inferenceReceiptStore: InferenceReceiptStore;
  provider: string;
  route: ChatE2eeRoute;
  nonce: string;
}): Promise<void> {
  const completionId = `chatcmpl_e2ee_${randomUUID()}`;
  input.reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const fullText = await decryptE2eeStream(input.response, input.session, (chunk) => {
    const payload = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: input.created,
      model: input.chatRequest.model,
      choices: [
        {
          index: 0,
          delta: { content: chunk },
          finish_reason: null,
        },
      ],
    };
    input.reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  const receipt = buildInferenceReceipt({
    store: input.inferenceReceiptStore,
    modelId: input.chatRequest.model,
    providerId: buildCatalogProviderId(input.provider, input.route.modelId),
    route: 'inference',
    tee: input.attestation,
    transport: 'venice-e2ee',
    inputText: readPromptText(input.chatRequest.messages),
    outputText: fullText,
    nonce: input.nonce,
  });

  input.reply.raw.write(
    `data: ${JSON.stringify(
      buildStreamPrivacyChunk(
        completionId,
        input.chatRequest,
        input.created,
        input.attestation,
        receipt.receiptId
      )
    )}\n\n`
  );
  input.reply.raw.write('data: [DONE]\n\n');
  input.reply.raw.end();
}

function readPromptText(messages: ChatCompletionRequest['messages']): string {
  return messages.map((message) => `${message.role}:${message.content}`).join('\n');
}

export async function executeE2eeChatRelay(input: {
  chatRequest: ChatCompletionRequest;
  route: ChatE2eeRoute;
  request: FastifyRequest;
  reply: FastifyReply;
  controlState: ApiControlState;
  inferenceReceiptStore: InferenceReceiptStore;
  env: NodeJS.ProcessEnv;
  created: number;
}) {
  const provider = input.route.attestationVendor;
  if (!isUpstreamProviderId(provider)) {
    throw new Error(`Unsupported E2EE provider: ${provider}`);
  }

  const apiKey = readUpstreamApiKey(input.request, input.controlState, provider, input.env);
  if (!apiKey) {
    throw new Error(
      'Upstream API key required for strict E2EE. Pass X-BossRaid-Upstream-Api-Key or configure BOSSRAID_VENICE_API_KEY.'
    );
  }

  const providerId = buildCatalogProviderId(provider, input.route.modelId);
  const { attestation, nonce, session } = await requireVeniceE2eeAttestation({
    provider,
    modelId: input.route.upstreamModelId,
    providerId,
    apiKey,
    env: input.env,
  });

  if (isProviderInferenceMock('venice', input.env)) {
    const mockContent = mockVeniceE2eeContent(input.route.upstreamModelId);
    const receipt = buildInferenceReceipt({
      store: input.inferenceReceiptStore,
      modelId: input.chatRequest.model,
      providerId,
      route: 'inference',
      tee: attestation,
      transport: 'venice-e2ee',
      inputText: readPromptText(input.chatRequest.messages),
      outputText: mockContent,
      nonce,
    });
    if (input.chatRequest.stream === true) {
      const completionId = 'chatcmpl_e2ee_mock';
      input.reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      input.reply.raw.write(
        `data: ${JSON.stringify({
          id: completionId,
          object: 'chat.completion.chunk',
          created: input.created,
          model: input.chatRequest.model,
          choices: [{ index: 0, delta: { content: mockContent }, finish_reason: null }],
        })}\n\n`
      );
      input.reply.raw.write(
        `data: ${JSON.stringify(
          buildStreamPrivacyChunk(
            completionId,
            input.chatRequest,
            input.created,
            attestation,
            receipt.receiptId
          )
        )}\n\n`
      );
      input.reply.raw.write('data: [DONE]\n\n');
      input.reply.raw.end();
      return;
    }
    return buildE2eeCompletionResponse(
      input.chatRequest,
      mockContent,
      input.created,
      attestation,
      receipt.receiptId
    );
  }

  const wantsStream = input.chatRequest.stream === true;
  const upstreamResponse = await fetchVeniceE2eeChatCompletion({
    apiKey,
    modelId: input.route.upstreamModelId,
    messages: input.chatRequest.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    session,
    stream: wantsStream,
    maxCompletionTokens: input.chatRequest.max_tokens ?? undefined,
    temperature: input.chatRequest.temperature ?? undefined,
  });

  if (wantsStream) {
    await streamE2eeCompletion({
      reply: input.reply,
      chatRequest: input.chatRequest,
      response: upstreamResponse,
      session,
      created: input.created,
      attestation,
      inferenceReceiptStore: input.inferenceReceiptStore,
      provider,
      route: input.route,
      nonce,
    });
    return;
  }

  const payload = (await upstreamResponse.json()) as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const encryptedContent = payload.choices?.[0]?.message?.content;
  if (typeof encryptedContent !== 'string' || encryptedContent.length === 0) {
    throw new Error('E2EE upstream returned empty content.');
  }
  const content = decryptChunk(encryptedContent, session.privateKey);
  const receipt = buildInferenceReceipt({
    store: input.inferenceReceiptStore,
    modelId: input.chatRequest.model,
    providerId,
    route: 'inference',
    tee: attestation,
    transport: 'venice-e2ee',
    inputText: readPromptText(input.chatRequest.messages),
    outputText: content,
    nonce,
  });
  return buildE2eeCompletionResponse(
    input.chatRequest,
    content,
    input.created,
    attestation,
    receipt.receiptId
  );
}
