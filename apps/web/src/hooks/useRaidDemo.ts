import { useEffect, useRef, useState } from 'react';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  fetchAttestedRuntime,
  fetchRaidAgentLog,
  fetchRaidResult,
  fetchRaidStatus,
  requestChatCompletion,
  spawnDemoRaid,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
  type ChatCompletionResponse,
  type Provider,
  type ProviderHealth,
  type RaidSpawnOutput,
} from '../api';
import { isTerminalRaidStatus, readErrorMessage } from '../demo-format';
import {
  buildAbsolutePath,
  buildDemoChatCompletionPayload,
  buildDirectChatSpawn,
  buildSpawnFromChatCompletion,
  CHAT_V1_DEMO_PROMPTS,
  RAID_DEMO_PROMPTS,
  type DemoRequestMode,
  type LiveRaidRun,
} from '../demo-result';
import { buildRaidDemoViewState } from '../demo-specialists';
import { buildLiveDemoPayload } from '../default-payload';

export type { DemoRequestMode, LiveRaidRun };
export type { ConversationSpecialistRecord, SpecialistTraceRecord } from '../demo-specialists';

type UseRaidDemoOptions = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
};

export function useRaidDemo({ providers, providerHealth }: UseRaidDemoOptions) {
  const [demoMode, setDemoMode] = useState<DemoRequestMode>('raid');
  const [liveDemoBrief, setLiveDemoBrief] = useState('');
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(null);
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [expandedArtifact, setExpandedArtifact] = useState<SubmissionArtifact | null>(null);
  const [runtimeAttestation, setRuntimeAttestation] =
    useState<AttestedEnvelope<AttestedRuntimePayload> | null>(null);
  const [runtimeAttestationError, setRuntimeAttestationError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const viewState = buildRaidDemoViewState({
    demoMode,
    liveDemoBrief,
    isLaunching,
    lastSubmittedBrief,
    launchError,
    liveRaidRun,
    providers,
    providerHealth,
    runtimeAttestation,
    runtimeAttestationError,
  });

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  useEffect(() => {
    let cancelled = false;

    void fetchAttestedRuntime()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRuntimeAttestation(response);
        setRuntimeAttestationError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setRuntimeAttestation(null);
        setRuntimeAttestationError(readErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!liveRaidRun || viewState.raidIsTerminal || liveRaidRun.directResponse) {
      return;
    }

    const spawn = liveRaidRun.spawn;
    const pollTimer = window.setInterval(() => {
      void refreshLiveRaid(spawn);
    }, 3_000);

    return () => window.clearInterval(pollTimer);
  }, [liveRaidRun?.spawn.raidId, viewState.raidIsTerminal]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: 'smooth',
    });
  }, [viewState.conversationSignature]);

  async function launchConversation() {
    const submittedBrief = liveDemoBrief.trim();
    if (!submittedBrief || isLaunching || !viewState.canLaunchLiveRaid) {
      return;
    }
    const startedAtMs = Date.now();

    setIsLaunching(true);
    setLaunchError(null);
    setLastSubmittedBrief(submittedBrief);
    setLiveRaidRun(null);
    setReceiptCopied(false);

    try {
      const response =
        demoMode === 'raid'
          ? await spawnDemoRaid(buildLiveDemoPayload(submittedBrief))
          : await requestChatCompletion(buildDemoChatCompletionPayload(submittedBrief));
      if (!response.ok || !response.data) {
        if (response.status === 404) {
          throw new Error(
            demoMode === 'raid'
              ? 'Free demo raid is not enabled on this host. The paid native route stays at POST /v1/raid.'
              : 'The v1 chat-completions route is not enabled on this host.'
          );
        }

        if (response.status === 401) {
          throw new Error(
            demoMode === 'raid'
              ? 'Free demo raid is enabled, but the proxy is missing a valid demo token.'
              : 'The v1 chat-completions route rejected the request.'
          );
        }

        if ((response.error ?? '').toLowerCase().includes('payment required')) {
          throw new Error(
            'This host sent /demo to the paid lane. The paid native route stays at POST /v1/raid.'
          );
        }

        throw new Error(response.error ?? `Raid launch failed with status ${response.status}.`);
      }

      const chatCompletion =
        demoMode === 'chat_v1' ? (response.data as ChatCompletionResponse) : undefined;
      const directResponse = demoMode === 'chat_v1' && !chatCompletion?.raid;
      const spawn =
        demoMode === 'raid'
          ? (response.data as RaidSpawnOutput)
          : (buildSpawnFromChatCompletion(chatCompletion ?? null) ??
            buildDirectChatSpawn(chatCompletion));

      setLiveRaidRun({
        requestMode: demoMode,
        spawn,
        directResponse,
        chatCompletion,
        startedAtMs,
        lastUpdatedAt: new Date().toISOString(),
        pollError: null,
      });

      if (!directResponse) {
        await refreshLiveRaid(spawn);
      }
    } catch (error) {
      setLaunchError(readErrorMessage(error));
    } finally {
      setIsLaunching(false);
    }
  }

  async function refreshLiveRaid(spawn: RaidSpawnOutput) {
    const [statusResult, resultResult, agentLogResult] = await Promise.allSettled([
      fetchRaidStatus(spawn.raidId, spawn.raidAccessToken),
      fetchRaidResult(spawn.raidId, spawn.raidAccessToken),
      fetchRaidAgentLog(spawn.raidId, spawn.raidAccessToken),
    ]);

    setLiveRaidRun((current) => {
      if (!current || current.spawn.raidId !== spawn.raidId) {
        return current;
      }

      const nextStatus = statusResult.status === 'fulfilled' ? statusResult.value : current.status;
      const nextResult = resultResult.status === 'fulfilled' ? resultResult.value : current.result;
      const nextAgentLog =
        agentLogResult.status === 'fulfilled' ? agentLogResult.value : current.agentLog;
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
    });
  }

  async function copyReceiptLink() {
    if (!liveRaidRun || !liveRaidRun.spawn.receiptPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildAbsolutePath(liveRaidRun.spawn.receiptPath));
      setReceiptCopied(true);
    } catch {
      setReceiptCopied(false);
    }
  }

  function resetConversation() {
    if (isLaunching) {
      return;
    }

    setLiveDemoBrief('');
    setLastSubmittedBrief(null);
    setLiveRaidRun(null);
    setLaunchError(null);
    setReceiptCopied(false);
    setExpandedArtifact(null);
  }

  function handleModeChange(nextMode: DemoRequestMode) {
    if (isLaunching || nextMode === demoMode) {
      return;
    }

    setDemoMode(nextMode);
    setLastSubmittedBrief(null);
    setLiveRaidRun(null);
    setLaunchError(null);
    setReceiptCopied(false);
    setExpandedArtifact(null);
  }

  return {
    demoMode,
    liveDemoBrief,
    setLiveDemoBrief,
    lastSubmittedBrief,
    liveRaidRun,
    isLaunching,
    launchError,
    receiptCopied,
    expandedArtifact,
    setExpandedArtifact,
    threadRef,
    runtimeAttestation,
    runtimeAttestationError,
    launchConversation,
    copyReceiptLink,
    resetConversation,
    handleModeChange,
    ...viewState,
  };
}

export { RAID_DEMO_PROMPTS, CHAT_V1_DEMO_PROMPTS };
export { isLowSignalChatPrompt } from '../demo-chat.js';
export {
  humanizeStatus,
  formatTimestamp,
  formatElapsedMs,
  readErrorMessage,
  isTerminalRaidStatus,
} from '../demo-format';
export {
  buildAgentLogPath,
  buildAttestedRuntimePath,
  buildAttestedResultPath,
} from '../demo-paths';
