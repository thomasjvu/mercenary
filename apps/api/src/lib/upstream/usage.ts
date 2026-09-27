import type { InferenceTokenUsage } from '@bossraid/constants';

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Normalize trusted upstream usage; reasoning/cache counts are already included in totals. */
export function readUpstreamUsage(
  value: unknown,
  anthropic = false
): InferenceTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = count(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = count(usage.completion_tokens ?? usage.output_tokens);
  if (inputTokens == null || outputTokens == null) return undefined;
  const input = (usage.prompt_tokens_details ?? usage.input_tokens_details ?? {}) as Record<
    string,
    unknown
  >;
  const output = (usage.completion_tokens_details ?? usage.output_tokens_details ?? {}) as Record<
    string,
    unknown
  >;
  const cacheReadTokens = count(usage.cache_read_input_tokens ?? input.cached_tokens);
  const cacheWriteTokens = count(usage.cache_creation_input_tokens ?? input.cache_write_tokens);
  return {
    inputTokens: inputTokens + (anthropic ? (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) : 0),
    outputTokens,
    details: {
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens: count(output.reasoning_tokens),
      inputAudioTokens: count(input.audio_tokens),
      outputAudioTokens: count(output.audio_tokens),
    },
  };
}
