import { type BossRaidOrchestrator } from '@bossraid/orchestrator';
import { type BossRaidResultOutput, type BossRaidStatusOutput } from '@bossraid/shared-types';
import { TIMEOUTS } from '@bossraid/constants';

export type ChatRaidOutcome = {
  status: BossRaidStatusOutput;
  result: BossRaidResultOutput;
};

export function isTerminalChatOutcome(outcome: ChatRaidOutcome): boolean {
  return ['final', 'cancelled', 'expired'].includes(outcome.status.status);
}

export async function waitForTerminalRaidOutput(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  timeoutMs: number,
  settleGraceMs: number
): Promise<ChatRaidOutcome> {
  return pollForTerminalChatOutcome(orchestrator, raidId, {
    timeoutMs,
    settleGraceMs: Math.max(settleGraceMs, TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS),
  });
}

export async function pollForTerminalChatOutcome(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  options: {
    timeoutMs: number;
    settleGraceMs: number;
    keepAliveIntervalMs?: number;
    onKeepAlive?: () => void;
  }
): Promise<ChatRaidOutcome> {
  const deadline = Date.now() + Math.max(options.timeoutMs, 1_000);
  const settleDeadline = deadline + options.settleGraceMs;
  let lastKeepAliveAt = Date.now();
  let latest = readChatRaidOutcome(orchestrator, raidId);

  while (Date.now() < settleDeadline) {
    latest = readChatRaidOutcome(orchestrator, raidId);
    if (isTerminalChatOutcome(latest)) {
      return latest;
    }

    if (
      options.onKeepAlive &&
      options.keepAliveIntervalMs &&
      Date.now() - lastKeepAliveAt >= options.keepAliveIntervalMs
    ) {
      options.onKeepAlive();
      lastKeepAliveAt = Date.now();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return latest;
}

function readChatRaidOutcome(orchestrator: BossRaidOrchestrator, raidId: string): ChatRaidOutcome {
  return {
    status: orchestrator.getStatus(raidId),
    result: orchestrator.getResult(raidId),
  };
}
