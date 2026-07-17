import type { ChatReasoningEffort } from '@bossraid/shared-types';

/** OpenAI-compatible options carried via raid task file `.bossraid/chat-options.json`. */
export type RaidChatOptions = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  reasoning_effort?: ChatReasoningEffort;
  /** Full multi-turn transcript when present (preferred over single prompt). */
  messages?: Array<{ role: string; content: string }>;
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
    if (Array.isArray(parsed.messages)) {
      const messages = parsed.messages
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const row = entry as Record<string, unknown>;
          const role = typeof row.role === 'string' ? row.role.trim() : '';
          const content = typeof row.content === 'string' ? row.content : '';
          if (!role || !content.trim()) {
            return null;
          }
          return { role, content: content.trim() };
        })
        .filter((row): row is { role: string; content: string } => row != null);
      if (messages.length > 0) {
        out.messages = messages;
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
  if (options.messages && options.messages.length > 0) {
    body.messages = options.messages;
  }
  return body;
}

/** Prefer embedded multi-turn messages; else single user prompt. */
export function resolveChatMessagesForUpstream(input: {
  prompt?: string;
  chatOptions?: RaidChatOptions;
}): Array<{ role: string; content: string }> {
  if (input.chatOptions?.messages && input.chatOptions.messages.length > 0) {
    return input.chatOptions.messages;
  }
  return [{ role: 'user', content: input.prompt ?? 'Reply with the single word: ok' }];
}
