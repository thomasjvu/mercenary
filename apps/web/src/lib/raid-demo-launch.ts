import { pollRaidSnapshot } from '@bossraid/proof-ui';
import {
  fetchRaidAgentLog,
  fetchRaidResult,
  fetchRaidStatus,
  type ChatCompletionResponse,
  type RaidSpawnOutput,
} from '../api';
import { requestPaidChatCompletion } from '../api/paid-chat.js';
import { spawnPaidRaid } from '../api/paid-raid.js';
import { API_BASE } from '../api/client.js';
import { isTerminalRaidStatus, readErrorMessage } from '../demo-format';
import {
  buildDemoChatCompletionPayload,
  buildDirectChatSpawn,
  buildSpawnFromChatCompletion,
  type DemoRequestMode,
  type LiveRaidRun,
} from '../demo-result';
import { buildLiveDemoPayload } from '../default-payload';

export async function launchPaidRaidDemo(input: {
  demoMode: DemoRequestMode;
  submittedBrief: string;
  fetchWithPayment: typeof fetch;
}): Promise<LiveRaidRun> {
  const startedAtMs = Date.now();

  if (input.demoMode === 'raid') {
    const spawn = await spawnPaidRaid(
      input.fetchWithPayment,
      buildLiveDemoPayload(input.submittedBrief),
      API_BASE
    );

    return {
      requestMode: input.demoMode,
      spawn,
      directResponse: false,
      chatCompletion: undefined,
      startedAtMs,
      lastUpdatedAt: new Date().toISOString(),
      pollError: null,
    };
  }

  const chatCompletion = await requestPaidChatCompletion(
    input.fetchWithPayment,
    buildDemoChatCompletionPayload(input.submittedBrief),
    API_BASE
  );
  const directResponse = !chatCompletion.raid;
  const spawn =
    buildSpawnFromChatCompletion(chatCompletion) ?? buildDirectChatSpawn(chatCompletion);

  return {
    requestMode: input.demoMode,
    spawn,
    directResponse,
    chatCompletion,
    startedAtMs,
    lastUpdatedAt: new Date().toISOString(),
    pollError: null,
  };
}

export async function refreshRaidDemoRun(
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
