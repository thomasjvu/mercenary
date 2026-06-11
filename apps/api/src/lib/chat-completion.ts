import { randomUUID } from 'node:crypto';
import {
  type BossRaidResultOutput,
  type BossRaidStatusOutput,
  type ChatCompletionRequest,
} from '@bossraid/shared-types';

export function buildChatCompletionResponse(
  chatRequest: ChatCompletionRequest,
  spawn: {
    raidId: string;
    raidAccessToken: string;
    receiptPath: string;
    selectedExperts: number;
  },
  outcome: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  },
  created: number
) {
  const content = buildUserFacingChatContent(spawn.raidId, outcome, chatRequest);

  return {
    id: `chatcmpl_${spawn.raidId}`,
    object: 'chat.completion',
    created,
    model: normalizeChatCompletionModel(chatRequest.model),
    system_fingerprint: 'mercenary-v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    raid: buildChatRaidMetadata(spawn, outcome),
    usage: estimateChatUsage(chatRequest.messages, content),
  };
}

export type BuildDirectChatCompletionResponse = ReturnType<
  typeof buildDirectChatCompletionResponse
>;

export function buildDirectChatCompletionResponse(
  chatRequest: ChatCompletionRequest,
  created: number
) {
  if (chatRequest.raidRequest) {
    return null;
  }

  const prompt = selectPrimaryChatPrompt(chatRequest);
  if (!isLowSignalChatPrompt(prompt)) {
    return null;
  }

  const content = buildDirectMercenaryChatReply(prompt);

  return {
    id: `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created,
    model: normalizeChatCompletionModel(chatRequest.model),
    system_fingerprint: 'mercenary-v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: estimateChatUsage(chatRequest.messages, content),
  };
}

export function buildChatRaidMetadata(
  spawn: {
    raidId: string;
    raidAccessToken: string;
    receiptPath: string;
    selectedExperts: number;
  },
  outcome?: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  }
) {
  const approved = outcome?.result.approvedSubmissions ?? [];
  const synthesized = outcome?.result.synthesizedOutput;

  return {
    raid_id: spawn.raidId,
    raid_access_token: spawn.raidAccessToken,
    receipt_path: spawn.receiptPath,
    agents_invited: spawn.selectedExperts,
    agents_succeeded: synthesized?.contributingProviderIds.length ?? approved.length,
    successful_agents: approved.map((entry) => entry.submission.providerId),
    synthesized_from_agents: synthesized?.contributingProviderIds,
    base_agent: synthesized?.baseSubmissionProviderId,
    status: outcome?.status.status,
  };
}

export function buildUserFacingChatContent(
  raidId: string,
  outcome: {
    status: BossRaidStatusOutput;
    result: BossRaidResultOutput;
  },
  chatRequest?: ChatCompletionRequest
): string {
  const synthesized = outcome.result.synthesizedOutput;
  const primary = outcome.result.primarySubmission;
  const fallback = buildChatCompletionFallback(raidId, outcome.status.status, chatRequest);

  return (
    synthesized?.answerText ??
    synthesized?.explanation ??
    primary?.submission.answerText ??
    primary?.submission.explanation ??
    fallback
  );
}

function buildChatCompletionFallback(
  raidId: string,
  status: BossRaidStatusOutput['status'],
  chatRequest?: ChatCompletionRequest
): string {
  const prompt = selectPrimaryChatPrompt(chatRequest);

  if (isLowSignalChatPrompt(prompt)) {
    return buildDirectMercenaryChatReply(prompt);
  }

  if (status === 'final') {
    return 'Mercenary did not get an approved specialist answer for this run. Rephrase the request more concretely, or use raid chat if you want a scoped build workflow.';
  }

  return `Mercenary opened raid ${raidId} and is still waiting for approved specialist output.`;
}

function selectPrimaryChatPrompt(chatRequest?: ChatCompletionRequest): string {
  if (!chatRequest) {
    return '';
  }

  const userMessages = chatRequest.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0);

  return userMessages[userMessages.length - 1] ?? '';
}

function buildDirectMercenaryChatReply(prompt: string): string {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (/^who are you\b/.test(normalizedPrompt)) {
    return 'I’m Mercenary, the Boss Raid orchestrator. I can answer directly for simple questions, or open specialists when you need scoped work.';
  }

  if (/^what can you do\b/.test(normalizedPrompt)) {
    return 'I can answer directly, compare options, and open specialists for code, art, gameplay, or promo work when the request needs real execution.';
  }

  if (isDirectJokePrompt(normalizedPrompt)) {
    return 'Why did the programmer go broke? Because he used up all his cache.';
  }

  return 'Mercenary here. Ask a question or give me a concrete task and I’ll answer directly or open specialists when it helps.';
}

export function isLowSignalChatPrompt(prompt: string): boolean {
  const normalizedPrompt = prompt.trim().toLowerCase();
  if (normalizedPrompt.length === 0) {
    return false;
  }

  return (
    /^(hi|hello|hey|yo|sup|hiya|howdy)\b/.test(normalizedPrompt) ||
    /^what'?s up\b/.test(normalizedPrompt) ||
    /^who are you\b/.test(normalizedPrompt) ||
    /^what can you do\b/.test(normalizedPrompt) ||
    isDirectJokePrompt(normalizedPrompt)
  );
}

function isDirectJokePrompt(normalizedPrompt: string): boolean {
  return (
    /^tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^can you tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(
      normalizedPrompt
    ) ||
    /^give me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^share (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/.test(normalizedPrompt) ||
    /^(another|one more|a better|a funnier|a new) joke\b/.test(normalizedPrompt) ||
    /^make me laugh\b/.test(normalizedPrompt) ||
    /^say something funny\b/.test(normalizedPrompt)
  );
}

export function normalizeChatCompletionModel(_model: string): string {
  return 'mercenary-v1';
}

export function estimateChatUsage(messages: ChatCompletionRequest['messages'], content: string) {
  const promptTokens = messages.reduce(
    (total, message) => total + estimateTokenCount(message.content),
    0
  );
  const completionTokens = estimateTokenCount(content);
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function estimateTokenCount(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 0;
  }

  return trimmed.split(/\s+/).length;
}

export { isTerminalChatOutcome, waitForTerminalRaidOutput } from './chat-terminal-wait.js';
export { streamChatCompletionResponse, streamDirectChatCompletionResponse } from './chat-stream.js';
