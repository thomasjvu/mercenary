import { useEffect, useRef, useState } from 'react';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  fetchAttestedRuntimeOptional,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
  type Provider,
  type ProviderHealth,
  type RaidSpawnOutput,
} from '../api';
import { isTerminalRaidStatus, readErrorMessage } from '../demo-format';
import {
  buildAbsolutePath,
  CHAT_V1_DEMO_PROMPTS,
  RAID_DEMO_PROMPTS,
  type DemoRequestMode,
  type LiveRaidRun,
} from '../demo-result';
import { buildRaidDemoViewState } from '../demo-specialists';
import {
  createMercenaryThread,
  deriveMercenaryThreadTitle,
  findMercenaryThread,
  persistMercenaryThreadStore,
  upsertMercenaryThread,
  type MercenaryThreadRecord,
  type MercenaryThreadStore,
} from '../lib/mercenary-threads.js';
import {
  buildDeleteThreadStore,
  buildRenameThreadStore,
  buildSelectThreadStore,
  buildStartNewThreadStore,
} from '../lib/raid-demo-thread-actions.js';
import { launchPaidRaidDemo, refreshRaidDemoRun } from '../lib/raid-demo-launch.js';
import {
  applyRaidDemoThreadRecord,
  buildRaidDemoThreadPersistenceSignature,
  resolveInitialRaidDemoThreadState,
} from '../lib/raid-demo-thread-store.js';

export type { DemoRequestMode, LiveRaidRun };
export type { ConversationSpecialistRecord, SpecialistTraceRecord } from '../demo-specialists';

type UseRaidDemoOptions = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  paymentEnabled: boolean;
  createFetchWithPayment?: () => Promise<typeof fetch>;
  persistThreads?: boolean;
};

export function useRaidDemo({
  providers,
  providerHealth,
  paymentEnabled,
  createFetchWithPayment,
  persistThreads = true,
}: UseRaidDemoOptions) {
  const initial = resolveInitialRaidDemoThreadState(persistThreads);
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

  function applyThread(thread: MercenaryThreadRecord) {
    const applied = applyRaidDemoThreadRecord(thread);
    setDemoMode(applied.demoMode);
    setLiveDemoBrief(applied.liveDemoBrief);
    setLastSubmittedBrief(applied.lastSubmittedBrief);
    setLiveRaidRun(applied.liveRaidRun);
    setLaunchError(applied.launchError);
    setReceiptCopied(false);
    setExpandedArtifact(null);
    lastPersistedThreadSignature.current = applied.persistenceSignature;
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

    const signature = buildRaidDemoThreadPersistenceSignature({
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
      const launched = await launchPaidRaidDemo({
        demoMode,
        submittedBrief,
        fetchWithPayment,
      });

      setLiveRaidRun(launched);

      if (!launched.directResponse) {
        await refreshLiveRaid(launched.spawn);
      }
    } catch (error) {
      setLaunchError(readErrorMessage(error));
    } finally {
      setIsLaunching(false);
    }
  }

  async function refreshLiveRaid(spawn: RaidSpawnOutput) {
    setLiveRaidRun((current) => {
      if (!current || current.spawn.raidId !== spawn.raidId) {
        return current;
      }

      void refreshRaidDemoRun(spawn, current).then((next) => {
        if (next) {
          setLiveRaidRun((latest) => (latest?.spawn.raidId === spawn.raidId ? next : latest));
        }
      });

      return current;
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
    if (isLaunching) {
      return;
    }

    const result = buildSelectThreadStore(threadStore, buildThreadSnapshot(), threadId);
    if (!result) {
      return;
    }

    if (persistThreads) {
      persistMercenaryThreadStore(result.store);
    }

    setThreadStore(result.store);
    setActiveThreadId(result.store.activeThreadId);
    applyThread(result.thread);
  }

  function startNewThread() {
    if (isLaunching) {
      return;
    }

    const result = buildStartNewThreadStore(threadStore, buildThreadSnapshot());

    if (persistThreads) {
      persistMercenaryThreadStore(result.store);
    }

    setThreadStore(result.store);
    setActiveThreadId(result.store.activeThreadId);
    applyThread(result.thread);
  }

  function resetConversation() {
    startNewThread();
  }

  function renameThread(threadId: string, title: string) {
    const nextStore = buildRenameThreadStore(threadStore, activeThreadId, threadId, title);

    if (persistThreads) {
      persistMercenaryThreadStore(nextStore);
    }

    setThreadStore(nextStore);
  }

  function deleteThread(threadId: string) {
    if (isLaunching) {
      return;
    }

    const result = buildDeleteThreadStore(
      threadStore,
      buildThreadSnapshot(),
      activeThreadId,
      threadId
    );

    if (persistThreads) {
      persistMercenaryThreadStore(result.store);
    }

    setThreadStore(result.store);
    setActiveThreadId(result.store.activeThreadId);

    if (result.thread) {
      applyThread(result.thread);
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
