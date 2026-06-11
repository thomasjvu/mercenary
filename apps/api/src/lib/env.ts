import { readBooleanEnv as readBooleanEnvUtil } from '@bossraid/shared-types';
import { TIMEOUTS } from '@bossraid/constants';

export const DEFAULT_PUBLIC_SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readPositiveNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function readBooleanEnv(value: string | undefined): boolean {
  return readBooleanEnvUtil(value);
}

export function resolveChatTerminalSettleGraceMs(env: NodeJS.ProcessEnv): number {
  const inviteAcceptMs = readPositiveInteger(env.BOSSRAID_INVITE_ACCEPT_MS, 3_000);
  return Math.min(
    TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_CAP_MS,
    Math.max(TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS, inviteAcceptMs)
  );
}
