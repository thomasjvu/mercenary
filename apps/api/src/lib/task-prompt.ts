/**
 * Best-effort single-string prompt for upstreams that only accept one user message.
 * Prefer multi-turn via `.bossraid/chat-options.json` messages when available.
 */
export function extractInferencePromptFromTask(task: {
  description?: string;
  failingSignals?: { expectedBehavior?: string };
}): string {
  const expected = task.failingSignals?.expectedBehavior?.trim();
  if (expected) {
    return expected;
  }

  const description = task.description?.trim();
  if (!description) {
    return 'Reply with one short sentence.';
  }

  // Multi-turn chat description is "Role:\ncontent" blocks joined by blank lines.
  const userBlocks = description
    .split('\n\n')
    .filter((block) => block.toLowerCase().startsWith('user:'))
    .map((block) => block.replace(/^user:\s*/i, '').trim());

  if (userBlocks.length > 0) {
    // Prefer full transcript when multiple turns exist so context is not dropped.
    if (userBlocks.length > 1 || description.toLowerCase().includes('system:')) {
      return description;
    }
    return userBlocks[userBlocks.length - 1] ?? description;
  }

  return description;
}
