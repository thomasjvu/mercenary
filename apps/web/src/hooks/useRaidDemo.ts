import { useEffect, useRef, useState } from 'react';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  fetchAttestedRuntimeOptional,
  fetchRaidAgentLog,
  fetchRaidResult,
  fetchRaidStatus,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
  type ChatCompletionResponse,
  type Provider,
  type ProviderHealth,
  type RaidSpawnOutput,
} from '../api';
import { pollRaidSnapshot } from '@bossraid/proof-ui';
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
import { API_BASE } from '../api/client.js';
import { requestPaidChatCompletion } from '../api/paid-chat.js';
import { spawnPaidRaid } from '../api/paid-raid.js';
import { buildLiveDemoPayload } from '../default-payload';
import {
  createMercenaryThread,
  deriveMercenaryThreadTitle,
  findMercenaryThread,
  loadMercenaryThreadStore,
  persistMercenaryThreadStore,
  upsertMercenaryThread,
  type MercenaryThreadRecord,
  type MercenaryThreadStore,
} from '../lib/mercenary-threads.js';

export type { DemoRequestMode, LiveRaidRun };
export type { ConversationSpecialistRecord, SpecialistTraceRecord } from '../demo-specialists';

type UseRaidDemoOptions = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  paymentEnabled: boolean;
  createFetchWithPayment?: () => Promise<typeof fetch>;
  persistThreads?: boolean;
};

function resolveInitialThreadState(persistThreads: boolean) {
  const store = persistThreads ? loadMercenaryThreadStore() : null;
  const thread =
    store != null
      ? (findMercenaryThread(store, store.activeThreadId) ?? createMercenaryThread())
      : createMercenaryThread();

  return {
    store: store ?? { activeThreadId: thread.id, threads: [thread] },
    thread,
  };
}

export function useRaidDemo({
  providers,
  providerHealth,
  paymentEnabled,
  createFetchWithPayment,
  persistThreads = true,
}: UseRaidDemoOptions) {
  const initial = resolveInitialThreadState(persistThreads);
  const [threadStore, setThreadStore] = useState<MercenaryThreadStore>(initial.store);
  const [activeThreadId, setActiveThreadId] = useState(initial.thread.id);
  const [demoMode, setDemoMode] = useState<DemoRequestMode>(initial.thread.demoMode);
  const [liveDemoBrief, setLiveDemoBrief] = useState(initial.thread.liveDemoBrief);
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(
    initial.thread.lastSubmittedBrief
  );
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(initial.thread.liveRaidRun);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(initial.thread.launchError);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [expandedArtifact, setExpandedArtifact] = useState<SubmissionArtifact | null>(null);
  const [runtimeAttestation, setRuntimeAttestation] =
    useState<AttestedEnvelope<AttestedRuntimePayload> | null>(null);
  const [runtimeAttestationError, setRuntimeAttestationError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const lastPersistedThreadSignature = useRef('');

  function buildThreadSnapshot(): MercenaryThreadRecord {
    const existing = findMercenaryThread(threadStore, activeThreadId);
    const title = existing?.titleLocked
      ? existing.title
      : deriveMercenaryThreadTitle({ lastSubmittedBrief, liveDemoBrief });

    return {
      id: activeThreadId,
      title,
      titleLocked: existing?.titleLocked,
      updatedAt: new Date().toISOString(),
      demoMode,
      liveDemoBrief,
      lastSubmittedBrief,
      liveRaidRun,
      launchError,
    };
  }

  function commitThreadSnapshot(snapshot: MercenaryThreadRecord) {
    if (!persistThreads) {
      return;
    }

    setThreadStore((current) => {
      const next = {
        activeThreadId,
        threads: upsertMercenaryThread(current, snapshot).threads,
      };
      persistMercenaryThreadStore(next);
      return next;
    });
  }

  function threadPersistenceSignature(input: {
    threadId: string;
    mode: DemoRequestMode;
    brief: string;
    submittedBrief: string | null;
    run: LiveRaidRun | null;
    error: string | null;
  }) {
    return JSON.stringify({
      activeThreadId: input.threadId,
      demoMode: input.mode,
      liveDemoBrief: input.brief,
      lastSubmittedBrief: input.submittedBrief,
      liveRaidRun: input.run,
      launchError: input.error,
    });
  }

  function applyThread(thread: MercenaryThreadRecord) {
    setDemoMode(thread.demoMode);
    setLiveDemoBrief(thread.liveDemoBrief);
    setLastSubmittedBrief(thread.lastSubmittedBrief);
    setLiveRaidRun(thread.liveRaidRun);
    setLaunchError(thread.launchError);
    setReceiptCopied(false);
    setExpandedArtifact(null);
    lastPersistedThreadSignature.current = threadPersistenceSignature({
      threadId: thread.id,
      mode: thread.demoMode,
      brief: thread.liveDemoBrief,
      submittedBrief: thread.lastSubmittedBrief,
      run: thread.liveRaidRun,
      error: thread.launchError,
    });
  }

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
    paymentEnabled,
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

    void fetchAttestedRuntimeOptional()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRuntimeAttestation(response ?? null);
        setRuntimeAttestationError(response ? null : 'Runtime attestation is not published yet.');
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
    }, 2_000);

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

  useEffect(() => {
    if (!persistThreads || isLaunching) {
      return;
    }

    const signature = threadPersistenceSignature({
      threadId: activeThreadId,
      mode: demoMode,
      brief: liveDemoBrief,
      submittedBrief: lastSubmittedBrief,
      run: liveRaidRun,
      error: launchError,
    });

    if (signature === lastPersistedThreadSignature.current) {
      return;
    }

    lastPersistedThreadSignature.current = signature;
    commitThreadSnapshot(buildThreadSnapshot());
  }, [
    persistThreads,
    isLaunching,
    activeThreadId,
    demoMode,
    liveDemoBrief,
    lastSubmittedBrief,
    liveRaidRun,
    launchError,
  ]);

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
      if (!paymentEnabled) {
        throw new Error('Payment is not configured on this host. Enable x402 before launching.');
      }

      if (!createFetchWithPayment) {
        throw new Error(
          'Connect MetaMask and subscribe to top up account credit before launching.'
        );
      }

      const fetchWithPayment = await createFetchWithPayment();

      if (demoMode === 'raid') {
        const spawn = await spawnPaidRaid(
          fetchWithPayment,
          buildLiveDemoPayload(submittedBrief),
          API_BASE
        );

        setLiveRaidRun({
          requestMode: demoMode,
          spawn,
          directResponse: false,
          chatCompletion: undefined,
          startedAtMs,
          lastUpdatedAt: new Date().toISOString(),
          pollError: null,
        });
        await refreshLiveRaid(spawn);
        return;
      }

      const chatCompletion = await requestPaidChatCompletion(
        fetchWithPayment,
        buildDemoChatCompletionPayload(submittedBrief),
        API_BASE
      );
      const directResponse = !chatCompletion.raid;
      const spawn =
        buildSpawnFromChatCompletion(chatCompletion) ?? buildDirectChatSpawn(chatCompletion);

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
    const {
      status: statusResult,
      result: resultResult,
      agentLog: agentLogResult,
    } = await pollRaidSnapshot({
      fetchStatus: () => fetchRaidStatus(spawn.raidId, spawn.raidAccessToken),
      fetchResult: () => fetchRaidResult(spawn.raidId, spawn.raidAccessToken),
      fetchAgentLog: () => fetchRaidAgentLog(spawn.raidId, spawn.raidAccessToken),
    });

    setLiveRaidRun((current) => {
      if (!current || current.spawn.raidId !== spawn.raidId) {
        return current;
      }

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

  function selectThread(threadId: string) {
    if (isLaunching || threadId === activeThreadId) {
      return;
    }

    const currentSnapshot = buildThreadSnapshot();
    const nextStore = {
      activeThreadId: threadId,
      threads: upsertMercenaryThread(threadStore, currentSnapshot).threads,
    };
    const nextThread = findMercenaryThread(nextStore, threadId);
    if (!nextThread) {
      return;
    }

    if (persistThreads) {
      persistMercenaryThreadStore(nextStore);
    }

    setThreadStore(nextStore);
    setActiveThreadId(threadId);
    applyThread(nextThread);
  }

  function startNewThread() {
    if (isLaunching) {
      return;
    }

    const currentSnapshot = buildThreadSnapshot();
    const mergedStore = upsertMercenaryThread(threadStore, currentSnapshot);
    const newThread = createMercenaryThread();
    const nextStore = {
      activeThreadId: newThread.id,
      threads: [newThread, ...mergedStore.threads],
    };

    if (persistThreads) {
      persistMercenaryThreadStore(nextStore);
    }

    setThreadStore(nextStore);
    setActiveThreadId(newThread.id);
    applyThread(newThread);
  }

  function resetConversation() {
    startNewThread();
  }

  function renameThread(threadId: string, title: string) {
    const trimmed = title.trim() || 'New thread';
    const nextStore = {
      activeThreadId,
      threads: threadStore.threads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: trimmed,
              titleLocked: true,
              updatedAt: new Date().toISOString(),
            }
          : thread
      ),
    };

    if (persistThreads) {
      persistMercenaryThreadStore(nextStore);
    }

    setThreadStore(nextStore);
  }

  function deleteThread(threadId: string) {
    if (isLaunching) {
      return;
    }

    const currentSnapshot = buildThreadSnapshot();
    const mergedThreads = upsertMercenaryThread(threadStore, currentSnapshot).threads;
    const nextThreads = mergedThreads.filter((thread) => thread.id !== threadId);

    if (nextThreads.length === 0) {
      const fresh = createMercenaryThread();
      const nextStore = { activeThreadId: fresh.id, threads: [fresh] };

      if (persistThreads) {
        persistMercenaryThreadStore(nextStore);
      }

      setThreadStore(nextStore);
      setActiveThreadId(fresh.id);
      applyThread(fresh);
      return;
    }

    const deletingActive = threadId === activeThreadId;
    const nextActiveId = deletingActive ? nextThreads[0]!.id : activeThreadId;
    const nextStore = { activeThreadId: nextActiveId, threads: nextThreads };

    if (persistThreads) {
      persistMercenaryThreadStore(nextStore);
    }

    setThreadStore(nextStore);
    setActiveThreadId(nextActiveId);

    if (deletingActive) {
      applyThread(nextThreads[0]!);
    }
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
    startNewThread,
    selectThread,
    renameThread,
    deleteThread,
    threads: threadStore.threads,
    activeThreadId,
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
