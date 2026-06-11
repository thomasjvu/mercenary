export const LOW_SIGNAL_CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|sup|hiya|howdy)\b/,
  /^what'?s up\b/,
  /^who are you\b/,
  /^what can you do\b/,
  /^tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/,
  /^can you tell me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/,
  /^give me (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/,
  /^share (?:(?:a|another|one more|a better|a funnier|a new) )?joke\b/,
  /^(another|one more|a better|a funnier|a new) joke\b/,
  /^make me laugh\b/,
  /^say something funny\b/,
] as const;

export function isLowSignalChatPrompt(brief: string): boolean {
  const normalizedBrief = brief.trim().toLowerCase();
  if (normalizedBrief.length === 0) {
    return false;
  }

  return LOW_SIGNAL_CHAT_PATTERNS.some((pattern) => pattern.test(normalizedBrief));
}
