import { PassThrough } from 'node:stream';
import { type FastifyReply } from 'fastify';
import { type BossRaidOrchestrator } from '@bossraid/orchestrator';
import { type BossRaidSpawnInput, type ChatCompletionRequest } from '@bossraid/shared-types';
import { DEFAULTS } from '@bossraid/constants';
import logger from '@bossraid/logger';
import {
  buildChatRaidMetadata,
  buildUserFacingChatContent,
  estimateChatUsage,
  normalizeChatCompletionModel,
  type BuildDirectChatCompletionResponse,
} from './chat-completion.js';
import { pollForTerminalChatOutcome } from './chat-terminal-wait.js';

function writeSseData(stream: PassThrough, payload: unknown): void {
  stream.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function streamDirectChatCompletionResponse(
  reply: FastifyReply,
  response: NonNullable<BuildDirectChatCompletionResponse>
) {
  const stream = new PassThrough();
  reply.code(200);
  reply.header('content-type', 'text/event-stream; charset=utf-8');
  reply.header('cache-control', 'no-cache, no-transform');
  reply.header('connection', 'keep-alive');
  reply.header('x-accel-buffering', 'no');
  void (async () => {
    try {
      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
      });

      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {
              content: response.choices[0]?.message.content ?? '',
            },
            finish_reason: null,
          },
        ],
      });

      writeSseData(stream, {
        id: response.id,
        object: 'chat.completion.chunk',
        created: response.created,
        model: response.model,
        system_fingerprint: response.system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      });
      stream.write('data: [DONE]\n\n');
    } finally {
      stream.end();
    }
  })();

  return reply.send(stream);
}

export async function streamChatCompletionResponse(
  reply: FastifyReply,
  orchestrator: BossRaidOrchestrator,
  input: {
    chatRequest: ChatCompletionRequest;
    raidRequest: BossRaidSpawnInput;
    spawn: {
      raidId: string;
      raidAccessToken: string;
      receiptPath: string;
      selectedExperts: number;
    };
    created: number;
    settleGraceMs: number;
    bossraidBilling?: {
      capture: (
        usage: ReturnType<typeof estimateChatUsage>,
        selectedSeller?: string
      ) => Promise<unknown>;
    };
  }
) {
  const stream = new PassThrough();
  reply.code(200);
  reply.header('content-type', 'text/event-stream; charset=utf-8');
  reply.header('cache-control', 'no-cache, no-transform');
  reply.header('connection', 'keep-alive');
  reply.header('x-accel-buffering', 'no');
  void (async () => {
    try {
      writeSseData(stream, {
        id: `chatcmpl_${input.spawn.raidId}`,
        object: 'chat.completion.chunk',
        created: input.created,
        model: normalizeChatCompletionModel(input.chatRequest.model),
        system_fingerprint: 'mercenary-v1',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
        raid: buildChatRaidMetadata(input.spawn),
      });

      const finalOutcome = await pollForTerminalChatOutcome(orchestrator, input.spawn.raidId, {
        timeoutMs: input.raidRequest.constraints.maxLatencySec * 1000,
        settleGraceMs: input.settleGraceMs,
        keepAliveIntervalMs: DEFAULTS.PROVIDER_HEALTH_TIMEOUT_MS,
        onKeepAlive: () => {
          stream.write(': keep-alive\n\n');
        },
      });
      const content = buildUserFacingChatContent(
        input.spawn.raidId,
        finalOutcome,
        input.chatRequest
      );
      const usage = estimateChatUsage(input.chatRequest.messages, content);
      const selectedSeller =
        finalOutcome.result.synthesizedOutput?.baseSubmissionProviderId ??
        finalOutcome.result.approvedSubmissions?.[0]?.submission.providerId;
      let bossraid: unknown;
      try {
        bossraid = await input.bossraidBilling?.capture(usage, selectedSeller);
      } catch (error) {
        logger.error({ error, raidId: input.spawn.raidId }, 'Mana billing capture failed.');
      }

      if (content.length > 0) {
        writeSseData(stream, {
          id: `chatcmpl_${input.spawn.raidId}`,
          object: 'chat.completion.chunk',
          created: input.created,
          model: normalizeChatCompletionModel(input.chatRequest.model),
          system_fingerprint: 'mercenary-v1',
          choices: [
            {
              index: 0,
              delta: {
                content,
              },
              finish_reason: null,
            },
          ],
          raid: buildChatRaidMetadata(input.spawn, finalOutcome),
          bossraid,
        });
      }

      writeSseData(stream, {
        id: `chatcmpl_${input.spawn.raidId}`,
        object: 'chat.completion.chunk',
        created: input.created,
        model: normalizeChatCompletionModel(input.chatRequest.model),
        system_fingerprint: 'mercenary-v1',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        raid: buildChatRaidMetadata(input.spawn, finalOutcome),
        bossraid,
        usage,
      });
      stream.write('data: [DONE]\n\n');
    } finally {
      stream.end();
    }
  })();

  return reply.send(stream);
}
