import {
  readBooleanEnv,
  readPositiveInteger,
  readPositiveNumber,
  TIMEOUTS,
} from '@bossraid/constants';

export const DEFAULT_PUBLIC_SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export { readBooleanEnv, readPositiveInteger, readPositiveNumber };

export function resolveChatTerminalSettleGraceMs(env: NodeJS.ProcessEnv): number {
  const inviteAcceptMs = readPositiveInteger(env.BOSSRAID_INVITE_ACCEPT_MS, 3_000);
  return Math.min(
    TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_CAP_MS,
    Math.max(TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS, inviteAcceptMs)
  );
}
