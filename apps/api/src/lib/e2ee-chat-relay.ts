import { randomUUID } from 'node:crypto';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { isUpstreamProviderId } from '@bossraid/constants';
import {
  decryptChunk,
  decryptE2eeStream,
  encryptMessagesForE2ee,
  generateE2eeSession,
} from '@bossraid/privacy-engine';
import type { ChatCompletionRequest } from '@bossraid/shared-types';
import { asSingleHeader } from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import { verifySellerUpstreamTeeAttestation } from './upstream-tee-service.js';
import { generateAttestationNonce } from './upstream/index.js';
import type { ChatE2eeRoute } from './e2ee-chat-hook.js';

const VENICE_CHAT_URL = 'https://api.venice.ai/api/v1/chat/completions';

function readPlatformApiKey(provider: string, env: NodeJS.ProcessEnv): string | undefined {
  if (!isUpstreamProviderId(provider)) {
    return undefined;
  }
  const envKey = `BOSSRAID_${provider.toUpperCase()}_API_KEY`;
  return env[envKey]?.trim() || undefined;
}

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

  const platformKey = readPlatformApiKey(provider, env);
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
  attestation: { signingAddress?: string; explorerUrl?: string }
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
    },
  };
}

async function streamE2eeCompletion(
  reply: FastifyReply,
  chatRequest: ChatCompletionRequest,
  response: Response,
  session: ReturnType<typeof generateE2eeSession>,
  created: number
): Promise<void> {
  const completionId = `chatcmpl_e2ee_${randomUUID()}`;
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  await decryptE2eeStream(response, session, (chunk) => {
    const payload = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: chatRequest.model,
      choices: [
        {
          index: 0,
          delta: { content: chunk },
          finish_reason: null,
        },
      ],
    };
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  reply.raw.write(
    `data: ${JSON.stringify({
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: chatRequest.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`
  );
  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
}

export async function executeE2eeChatRelay(input: {
  chatRequest: ChatCompletionRequest;
  route: ChatE2eeRoute;
  request: FastifyRequest;
  reply: FastifyReply;
  controlState: ApiControlState;
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

  const attestation = await verifySellerUpstreamTeeAttestation({
    provider,
    modelId: input.route.upstreamModelId,
    providerId: `catalog:${provider}:${input.route.modelId}`,
    apiKey,
    nonce: generateAttestationNonce(),
  });

  if (!attestation.valid || !attestation.e2eeReady) {
    throw new Error('TEE attestation must pass with E2EE signing key before inference.');
  }

  const signingKey = attestation.signingKey;
  if (!signingKey) {
    throw new Error('Attestation response did not include an E2EE signing key.');
  }

  if (input.env.BOSSRAID_VENICE_MOCK === '1') {
    const mockContent = `mock-venice-e2ee:${input.route.upstreamModelId}`;
    if (input.chatRequest.stream === true) {
      input.reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      input.reply.raw.write(
        `data: ${JSON.stringify({
          id: `chatcmpl_e2ee_mock`,
          object: 'chat.completion.chunk',
          created: input.created,
          model: input.chatRequest.model,
          choices: [{ index: 0, delta: { content: mockContent }, finish_reason: null }],
        })}\n\n`
      );
      input.reply.raw.write('data: [DONE]\n\n');
      input.reply.raw.end();
      return;
    }
    return buildE2eeCompletionResponse(input.chatRequest, mockContent, input.created, attestation);
  }

  const session = generateE2eeSession(signingKey, attestation.signingAddress);
  const encryptedMessages = encryptMessagesForE2ee(
    input.chatRequest.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    session.modelPublicKey
  );

  const wantsStream = input.chatRequest.stream === true;
  const upstreamResponse = await fetch(VENICE_CHAT_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'X-Venice-TEE-Client-Pub-Key': session.publicKeyHex,
      'X-Venice-TEE-Model-Pub-Key': session.modelPublicKey,
      'X-Venice-TEE-Signing-Algo': 'ecdsa',
    },
    body: JSON.stringify({
      model: input.route.upstreamModelId,
      messages: encryptedMessages,
      stream: wantsStream,
      ...(input.chatRequest.max_tokens == null
        ? {}
        : { max_completion_tokens: input.chatRequest.max_tokens }),
      ...(input.chatRequest.temperature == null
        ? {}
        : { temperature: input.chatRequest.temperature }),
    }),
  });

  if (!upstreamResponse.ok) {
    throw new Error(`E2EE upstream request failed (${upstreamResponse.status}).`);
  }

  if (wantsStream) {
    await streamE2eeCompletion(
      input.reply,
      input.chatRequest,
      upstreamResponse,
      session,
      input.created
    );
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
  return buildE2eeCompletionResponse(input.chatRequest, content, input.created, attestation);
}
