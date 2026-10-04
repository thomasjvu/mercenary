import { isTerminalRaidStatus, TERMINAL_RAID_STATUSES } from '@bossraid/constants';

export { TERMINAL_RAID_STATUSES as DEFAULT_TERMINAL_RAID_STATUSES, isTerminalRaidStatus };

export function raidPollingRefreshInterval(input: {
  enabled: boolean;
  status?: string;
  intervalMs?: number;
  terminalStatuses?: Set<string>;
}): number {
  if (!input.enabled) {
    return 0;
  }

  const terminalStatuses = input.terminalStatuses ?? TERMINAL_RAID_STATUSES;
  if (input.status != null && terminalStatuses.has(input.status)) {
    return 0;
  }

  return input.intervalMs ?? 2_000;
}

export async function pollRaidSnapshot<TStatus, TResult, TAgentLog = unknown>(input: {
  fetchStatus: () => Promise<TStatus>;
  fetchResult: () => Promise<TResult>;
  fetchAgentLog?: () => Promise<TAgentLog>;
}): Promise<{
  status: PromiseSettledResult<TStatus>;
  result: PromiseSettledResult<TResult>;
  agentLog?: PromiseSettledResult<TAgentLog>;
}> {
  const [status, result, agentLog] = await Promise.allSettled([
    input.fetchStatus(),
    input.fetchResult(),
    ...(input.fetchAgentLog ? [input.fetchAgentLog()] : []),
  ] as const);

  return { status, result, agentLog };
}
