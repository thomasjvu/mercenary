import useSWR from 'swr';
import { DEFAULT_TERMINAL_RAID_STATUSES, raidPollingRefreshInterval } from '@bossraid/proof-ui';

type RaidPollingOptions<
  TStatus extends { status?: string },
  TResult = unknown,
  TAgentLog = unknown,
> = {
  enabled?: boolean;
  intervalMs?: number;
  terminalStatuses?: Set<string>;
  fetchStatus: () => Promise<TStatus>;
  fetchResult: () => Promise<TResult>;
  fetchAgentLog?: () => Promise<TAgentLog>;
  includeAgentLog?: boolean;
};

export function useRaidPolling<
  TStatus extends { status?: string },
  TResult = unknown,
  TAgentLog = unknown,
>(
  raidKey: string | null | undefined,
  accessToken: string | null | undefined,
  options: RaidPollingOptions<TStatus, TResult, TAgentLog>
) {
  const enabled = options.enabled !== false && Boolean(raidKey && accessToken);
  const terminalStatuses = options.terminalStatuses ?? DEFAULT_TERMINAL_RAID_STATUSES;
  const intervalMs = options.intervalMs ?? 2_000;

  const status = useSWR(
    enabled ? (['raid-status', raidKey, accessToken] as const) : null,
    () => options.fetchStatus(),
    {
      refreshInterval: (latestData?: TStatus) =>
        raidPollingRefreshInterval({
          enabled,
          status: latestData?.status,
          intervalMs,
          terminalStatuses,
        }),
      revalidateOnFocus: true,
    }
  );

  const statusIsTerminal = status.data?.status ? terminalStatuses.has(status.data.status) : false;

  const result = useSWR(
    enabled ? (['raid-result', raidKey, accessToken] as const) : null,
    () => options.fetchResult(),
    {
      refreshInterval: () =>
        raidPollingRefreshInterval({
          enabled,
          status: status.data?.status,
          intervalMs,
          terminalStatuses,
        }),
      revalidateOnFocus: true,
    }
  );

  const agentLog = useSWR(
    enabled && options.includeAgentLog && options.fetchAgentLog
      ? (['raid-agent-log', raidKey, accessToken] as const)
      : null,
    () => options.fetchAgentLog?.(),
    {
      refreshInterval: () =>
        raidPollingRefreshInterval({
          enabled,
          status: status.data?.status,
          intervalMs,
          terminalStatuses,
        }),
      revalidateOnFocus: true,
    }
  );

  return {
    status,
    result,
    agentLog,
    statusIsTerminal,
  };
}
