import { pollRaidSnapshot } from '@bossraid/proof-ui';
import {
  fetchRaidAgentLog,
  fetchRaidResult,
  fetchRaidStatus,
  type ChatCompletionResponse,
  type RaidSpawnOutput,
} from '../api';
import { requestApiKeyChatCompletion, requestPaidChatCompletion } from '../api/paid-chat.js';
import { API_BASE } from '../api/client.js';
import { isTerminalRaidStatus, readErrorMessage } from '../mercenary-format';
import {
  buildMercenaryChatCompletionPayload,
  buildDirectChatSpawn,
  buildSpawnFromChatCompletion,
  type LiveRaidRun,
} from '../mercenary-result';

export async function launchPaidMercenaryRaid(input: {
  submittedBrief: string;
  maxBudgetUsd: number;
  paymentMode: 'wallet' | 'api_key';
  apiKey?: string;
  fetchWithPayment?: typeof fetch;
}): Promise<LiveRaidRun> {
  const startedAtMs = Date.now();
  const payload = buildMercenaryChatCompletionPayload(input.submittedBrief, input.maxBudgetUsd);

  const chatCompletion =
    input.paymentMode === 'api_key'
      ? await requestApiKeyChatCompletion(input.apiKey ?? '', payload, API_BASE)
      : await requestPaidChatCompletion(input.fetchWithPayment ?? fetch, payload, API_BASE);
  const directResponse = !chatCompletion.raid;
  const spawn =
    buildSpawnFromChatCompletion(chatCompletion) ?? buildDirectChatSpawn(chatCompletion);

  return {
    spawn,
    directResponse,
    chatCompletion,
    startedAtMs,
    lastUpdatedAt: new Date().toISOString(),
    pollError: null,
  };
}

export async function refreshMercenaryRaidRun(
  spawn: RaidSpawnOutput,
  current: LiveRaidRun | null
): Promise<LiveRaidRun | null> {
  if (!current || current.spawn.raidId !== spawn.raidId) {
    return current;
  }

  const {
    status: statusResult,
    result: resultResult,
    agentLog: agentLogResult,
  } = await pollRaidSnapshot({
    fetchStatus: () => fetchRaidStatus(spawn.raidId, spawn.raidAccessToken),
    fetchResult: () => fetchRaidResult(spawn.raidId, spawn.raidAccessToken),
    fetchAgentLog: () => fetchRaidAgentLog(spawn.raidId, spawn.raidAccessToken),
  });

  const nextStatus = statusResult.status === 'fulfilled' ? statusResult.value : current.status;
  const nextResult = resultResult.status === 'fulfilled' ? resultResult.value : current.result;
  const nextAgentLog =
    agentLogResult?.status === 'fulfilled' ? agentLogResult.value : current.agentLog;
  const nextRaidStatus = nextStatus?.status ?? current.spawn.status;
  const pollError =
    statusResult.status === 'rejected'
      ? readErrorMessage(statusResult.reason)
      : resultResult.status === 'rejected' && isTerminalRaidStatus(nextRaidStatus)
        ? readErrorMessage(resultResult.reason)
        : null;

  return {
    ...current,
    completedAtMs:
      current.completedAtMs ?? (isTerminalRaidStatus(nextRaidStatus) ? Date.now() : undefined),
    status: nextStatus,
    result: nextResult,
    agentLog: nextAgentLog,
    lastUpdatedAt: new Date().toISOString(),
    pollError,
  };
}

export type { ChatCompletionResponse };
