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

  const userBlocks = description
    .split('\n\n')
    .filter((block) => block.toLowerCase().startsWith('user:'))
    .map((block) => block.replace(/^user:\s*/i, '').trim());

  if (userBlocks.length > 0) {
    return userBlocks[userBlocks.length - 1] ?? description;
  }

  return description;
}
