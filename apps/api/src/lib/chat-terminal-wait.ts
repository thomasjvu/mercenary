import { type BossRaidOrchestrator } from '@bossraid/orchestrator';
import { type BossRaidResultOutput, type BossRaidStatusOutput } from '@bossraid/shared-types';
import { TIMEOUTS } from '@bossraid/constants';
import type { SettlementMode } from './settlement-mode.js';

export type ChatRaidOutcome = {
  status: BossRaidStatusOutput;
  result: BossRaidResultOutput;
};

export class ChatTerminalWaitError extends Error {
  readonly raidId: string;
  readonly outcome: ChatRaidOutcome;

  constructor(raidId: string, outcome: ChatRaidOutcome) {
    super(`Raid ${raidId} did not reach a terminal state before the wait deadline.`);
    this.name = 'ChatTerminalWaitError';
    this.raidId = raidId;
    this.outcome = outcome;
  }
}

export function isTerminalChatOutcome(outcome: ChatRaidOutcome): boolean {
  return ['final', 'cancelled', 'expired'].includes(outcome.status.status);
}

export async function waitForTerminalRaidOutput(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  timeoutMs: number,
  settleGraceMs: number,
  settlementMode: SettlementMode = 'file'
): Promise<ChatRaidOutcome> {
  return pollForTerminalChatOutcome(orchestrator, raidId, {
    timeoutMs,
    settleGraceMs: Math.max(settleGraceMs, TIMEOUTS.CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS),
    settlementMode,
  });
}

export async function pollForTerminalChatOutcome(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  options: {
    timeoutMs: number;
    settleGraceMs: number;
    settlementMode?: SettlementMode;
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
    if (
      isTerminalChatOutcome(latest) &&
      isSettlementReady(orchestrator, raidId, options.settlementMode)
    ) {
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

  if (
    !isTerminalChatOutcome(latest) ||
    !isSettlementReady(orchestrator, raidId, options.settlementMode)
  ) {
    throw new ChatTerminalWaitError(raidId, latest);
  }

  return latest;
}

function isSettlementReady(
  orchestrator: BossRaidOrchestrator,
  raidId: string,
  settlementMode: SettlementMode = 'file'
): boolean {
  if (settlementMode === 'off') {
    return true;
  }

  return orchestrator.getRaid(raidId)?.settlementExecution != null;
}

function readChatRaidOutcome(orchestrator: BossRaidOrchestrator, raidId: string): ChatRaidOutcome {
  return {
    status: orchestrator.getStatus(raidId),
    result: orchestrator.getResult(raidId),
  };
}
