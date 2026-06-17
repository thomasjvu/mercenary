import { isLowSignalChatPrompt } from './mercenary-chat.js';
import { buildNativeChatRaidPayload } from './fixtures/mercenary-gb-studio-seed.js';

export const DEFAULT_RAID_BRIEF =
  'Create a one-room GB Studio microgame called Boss Raid: Slime Panic. Mercenary should split this into gameplay, pixel art, and trailer work, keep the creative direction consistent, and return one verified receipt-backed result.';

export function buildMercenaryRaidPayload(brief: string) {
  const normalizedBrief = brief.trim() || DEFAULT_RAID_BRIEF;
  return buildNativeChatRaidPayload(normalizedBrief);
}

export { isLowSignalChatPrompt };
