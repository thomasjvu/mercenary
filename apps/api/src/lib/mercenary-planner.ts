import type { BossRaidSpawnInput, ChatCompletionRequest } from '@bossraid/shared-types';
import { createVeniceRaidClient } from '@bossraid/venice-client';
import {
  buildDirectMercenaryChatReply,
  estimateChatUsage,
  isLowSignalChatPrompt,
  normalizeChatCompletionModel,
} from './chat-completion.js';
import { isProviderInferenceMock } from './upstream-mock.js';
import { probeVeniceE2eeChatCompletion } from './venice-e2ee.js';

export type MercenaryPlannerRaidPolicyOverrides = {
  maxAgents?: number;
  maxTotalCost?: number;
  maxLatencySec?: number;
  requiredCapabilities?: string[];
  selectionMode?: string;
};

export type MercenaryPlannerDecision = {
  action: 'direct' | 'raid';
  reply?: string;
  raidPolicyOverrides?: MercenaryPlannerRaidPolicyOverrides;
};

const DEFAULT_BASE_MODEL = 'e2ee-gemma-4-31b';

const PLANNER_SYSTEM_PROMPT = `You are Mercenary, the Boss Raid orchestrator.
Decide whether to answer directly or open a specialist raid.
Return JSON only with this shape:
{"action":"direct"|"raid","reply":"required when action is direct","raidPolicyOverrides":{"maxAgents":3}}
Use action "direct" for greetings, jokes, and simple questions you can answer in one reply.
Use action "raid" for scoped builds, multi-step work, code review, art, gameplay, or promo tasks.`;

export function readMercenaryBaseModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BOSSRAID_MERCENARY_BASE_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_BASE_MODEL;
}

export function selectPrimaryChatPrompt(chatRequest: ChatCompletionRequest): string {
  const userMessages = chatRequest.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0);

  return userMessages[userMessages.length - 1] ?? '';
}

export function buildPlannerDirectChatCompletionResponse(
  chatRequest: ChatCompletionRequest,
  created: number,
  reply: string
) {
  return {
    id: `chatcmpl_direct_${created}`,
    object: 'chat.completion' as const,
    created,
    model: normalizeChatCompletionModel(chatRequest.model),
    system_fingerprint: 'mercenary-v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: reply,
        },
        finish_reason: 'stop' as const,
      },
    ],
    usage: estimateChatUsage(chatRequest.messages, reply),
  };
}

export function applyMercenaryPlannerOverrides(
  raidRequest: BossRaidSpawnInput,
  overrides?: MercenaryPlannerRaidPolicyOverrides
): BossRaidSpawnInput {
  if (!overrides) {
    return raidRequest;
  }

  return {
    ...raidRequest,
    constraints: {
      ...raidRequest.constraints,
      ...(overrides.maxAgents == null ? {} : { numExperts: overrides.maxAgents }),
      ...(overrides.maxTotalCost == null ? {} : { maxBudgetUsd: overrides.maxTotalCost }),
      ...(overrides.maxLatencySec == null ? {} : { maxLatencySec: overrides.maxLatencySec }),
      ...(overrides.requiredCapabilities == null
        ? {}
        : { requireSpecializations: overrides.requiredCapabilities }),
      ...(overrides.selectionMode == null
        ? {}
        : {
            selectionMode:
              overrides.selectionMode as BossRaidSpawnInput['constraints']['selectionMode'],
          }),
    },
  };
}

export async function planMercenaryChatResponse(input: {
  chatRequest: ChatCompletionRequest;
  env?: NodeJS.ProcessEnv;
}): Promise<MercenaryPlannerDecision> {
  const env = input.env ?? process.env;
  const prompt = selectPrimaryChatPrompt(input.chatRequest);

  if (isProviderInferenceMock('venice', env)) {
    return planMercenaryChatHeuristic(prompt);
  }

  const apiKey = env.BOSSRAID_VENICE_API_KEY?.trim();
  if (!apiKey) {
    return planMercenaryChatHeuristic(prompt);
  }

  const modelId = readMercenaryBaseModel(env);
  const plannerPrompt = buildPlannerPrompt(input.chatRequest);

  try {
    const e2eeResult = await probeVeniceE2eeChatCompletion({
      apiKey,
      modelId,
      prompt: plannerPrompt,
      providerId: `mercenary-planner:${modelId}`,
      env,
    });
    const parsed = parsePlannerModelOutput(e2eeResult.content);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to plain Venice chat.
  }

  try {
    const veniceClient = createVeniceRaidClient({ apiKey, model: modelId });
    const plainResult = await veniceClient.chat({
      system: PLANNER_SYSTEM_PROMPT,
      user: plannerPrompt,
      model: modelId,
    });
    const parsed = parsePlannerModelOutput(plainResult.content);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Planner is best-effort; fall back to heuristics when Venice is down/auth-failing.
  }

  return planMercenaryChatHeuristic(prompt);
}

function buildPlannerPrompt(chatRequest: ChatCompletionRequest): string {
  const transcript = chatRequest.messages
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .filter((line) => line.length > messageRolePrefixLength(line))
    .join('\n');

  return ['Conversation:', transcript || '(empty)', 'Return JSON only.'].join('\n');
}

function messageRolePrefixLength(line: string): number {
  const colonIndex = line.indexOf(':');
  return colonIndex === -1 ? 0 : colonIndex + 2;
}

export function planMercenaryChatHeuristicForTest(prompt: string): MercenaryPlannerDecision {
  return planMercenaryChatHeuristic(prompt);
}

export function parsePlannerModelOutputForTest(content: string): MercenaryPlannerDecision | null {
  return parsePlannerModelOutput(content);
}

function planMercenaryChatHeuristic(prompt: string): MercenaryPlannerDecision {
  if (isLowSignalChatPrompt(prompt)) {
    return {
      action: 'direct',
      reply: buildDirectMercenaryChatReply(prompt),
    };
  }

  return { action: 'raid' };
}

function parsePlannerModelOutput(content: string): MercenaryPlannerDecision | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const jsonText = extractJsonObject(trimmed);
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      action?: unknown;
      reply?: unknown;
      raidPolicyOverrides?: MercenaryPlannerRaidPolicyOverrides;
    };

    if (parsed.action === 'direct') {
      const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
      if (!reply) {
        return null;
      }

      return {
        action: 'direct',
        reply,
        raidPolicyOverrides: normalizePlannerOverrides(parsed.raidPolicyOverrides),
      };
    }

    if (parsed.action === 'raid') {
      return {
        action: 'raid',
        raidPolicyOverrides: normalizePlannerOverrides(parsed.raidPolicyOverrides),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function extractJsonObject(content: string): string | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }

  return content.slice(start, end + 1);
}

function normalizePlannerOverrides(
  value: MercenaryPlannerRaidPolicyOverrides | undefined
): MercenaryPlannerRaidPolicyOverrides | undefined {
  if (!value) {
    return undefined;
  }

  const overrides: MercenaryPlannerRaidPolicyOverrides = {};
  if (typeof value.maxAgents === 'number' && Number.isFinite(value.maxAgents)) {
    overrides.maxAgents = Math.max(1, Math.floor(value.maxAgents));
  }
  if (typeof value.maxTotalCost === 'number' && Number.isFinite(value.maxTotalCost)) {
    overrides.maxTotalCost = value.maxTotalCost;
  }
  if (typeof value.maxLatencySec === 'number' && Number.isFinite(value.maxLatencySec)) {
    overrides.maxLatencySec = value.maxLatencySec;
  }
  if (Array.isArray(value.requiredCapabilities)) {
    overrides.requiredCapabilities = value.requiredCapabilities.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
    );
  }
  if (typeof value.selectionMode === 'string' && value.selectionMode.trim().length > 0) {
    overrides.selectionMode = value.selectionMode.trim();
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
