export const DEFAULT_TERMINAL_RAID_STATUSES = new Set(['final', 'cancelled', 'expired']);

export function isTerminalRaidStatus(
  status: string | undefined,
  terminalStatuses: Set<string> = DEFAULT_TERMINAL_RAID_STATUSES
): boolean {
  return status != null && terminalStatuses.has(status);
}

export function raidPollingRefreshInterval(input: {
  enabled: boolean;
  status?: string;
  intervalMs?: number;
  terminalStatuses?: Set<string>;
}): number {
  if (!input.enabled) {
    return 0;
  }

  if (isTerminalRaidStatus(input.status, input.terminalStatuses)) {
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
  const requests: [Promise<TStatus>, Promise<TResult>, ...(Promise<TAgentLog> | [])[]] = [
    input.fetchStatus(),
    input.fetchResult(),
  ];

  if (input.fetchAgentLog) {
    requests.push(input.fetchAgentLog());
  }

  const settled = await Promise.allSettled(requests);

  return {
    status: settled[0] as PromiseSettledResult<TStatus>,
    result: settled[1] as PromiseSettledResult<TResult>,
    agentLog: settled[2] as PromiseSettledResult<TAgentLog> | undefined,
  };
}
