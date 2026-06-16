import { isLowSignalChatPrompt } from './mercenary-chat.js';
import {
  buildNativeChatRaidPayload,
  buildSeededGameRaidPayload,
} from './fixtures/mercenary-gb-studio-seed.js';

export const DEFAULT_RAID_BRIEF =
  'Create a one-room GB Studio microgame called Boss Raid: Slime Panic. Mercenary should split this into gameplay, pixel art, and trailer work, keep the creative direction consistent, and return one verified receipt-backed result.';

const SEEDED_GAME_BUILD_SIGNALS = [
  /\bgb studio\b/,
  /\bmicrogame\b/,
  /\bpixel art\b/,
  /\bsprite(?:s|sheet)?\b/,
  /\btrailer\b/,
  /\bteaser\b/,
  /\bone-room\b/,
  /\bslime\b/,
  /\bdungeon\b/,
  /\blaunch package\b/,
  /\barcade challenge\b/,
  /\bkey\b/,
  /\bboss\b/,
];

const EXPLICIT_WORK_SIGNALS = [
  /^(build|create|make|ship|design|generate|draft|produce|implement)\b/,
  /\b(can you|could you|please|help me|i want you to|i need you to)\s+(build|create|make|ship|design|generate|draft|produce|implement)\b/,
  /\bmake me\b/,
  /\bcreate me\b/,
];

function isSeededGameBuildRequest(brief: string): boolean {
  const normalizedBrief = brief.trim().toLowerCase();
  if (normalizedBrief.length === 0) {
    return false;
  }

  const hasWorkSignal = EXPLICIT_WORK_SIGNALS.some((pattern) => pattern.test(normalizedBrief));
  const hasSeededGameSignal = SEEDED_GAME_BUILD_SIGNALS.some((pattern) =>
    pattern.test(normalizedBrief)
  );
  return hasWorkSignal && hasSeededGameSignal;
}

export function buildMercenaryRaidPayload(brief: string) {
  const normalizedBrief = brief.trim() || DEFAULT_RAID_BRIEF;
  return isSeededGameBuildRequest(normalizedBrief)
    ? buildSeededGameRaidPayload(normalizedBrief)
    : buildNativeChatRaidPayload(normalizedBrief);
}

export { isLowSignalChatPrompt };
