import type { ChatReasoningEffort } from '@bossraid/shared-types';

/** OpenAI-compatible options carried via raid task file `.bossraid/chat-options.json`. */
export type RaidChatOptions = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: ChatReasoningEffort;
};

const CHAT_OPTIONS_PATH = '.bossraid/chat-options.json';
const REASONING_EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh']);

/**
 * Read chat sampling / reasoning options embedded by `buildBossRaidRequestFromChatCompletion`.
 */
export function extractChatOptionsFromTask(task: {
  files?: Array<{ path?: string; content?: string }>;
}): RaidChatOptions {
  const file = task.files?.find((entry) => entry.path === CHAT_OPTIONS_PATH);
  if (!file?.content?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(file.content) as Record<string, unknown>;
    const out: RaidChatOptions = {};

    if (typeof parsed.model === 'string' && parsed.model.trim()) {
      out.model = parsed.model.trim();
    }
    if (typeof parsed.max_tokens === 'number' && Number.isFinite(parsed.max_tokens)) {
      out.max_tokens = Math.max(1, Math.floor(parsed.max_tokens));
    }
    if (typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)) {
      out.temperature = parsed.temperature;
    }
    if (typeof parsed.reasoning_effort === 'string') {
      const effort = parsed.reasoning_effort.trim().toLowerCase();
      if (REASONING_EFFORTS.has(effort)) {
        out.reasoning_effort = effort as ChatReasoningEffort;
      }
    }

    return out;
  } catch {
    return {};
  }
}

/** Merge optional OpenAI chat fields into an upstream request body. */
export function applyChatOptionsToBody(
  body: Record<string, unknown>,
  options?: RaidChatOptions
): Record<string, unknown> {
  if (!options) {
    return body;
  }
  if (options.max_tokens != null) {
    body.max_tokens = options.max_tokens;
  }
  if (options.temperature != null) {
    body.temperature = options.temperature;
  }
  if (options.reasoning_effort) {
    body.reasoning_effort = options.reasoning_effort;
  }
  return body;
}
