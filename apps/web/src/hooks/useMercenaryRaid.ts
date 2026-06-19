import { useEffect, useRef, useState } from 'react';
import { useCopyFeedback } from './useCopyFeedback.js';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  fetchAttestedRuntimeOptional,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
  type Provider,
  type ProviderHealth,
  type RaidSpawnOutput,
} from '../api';
import { isTerminalRaidStatus, readErrorMessage } from '../mercenary-format';
import { buildAbsolutePath, type LiveRaidRun } from '../mercenary-result';
import { buildMercenaryRaidViewState } from '../mercenary-specialists';
import {
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
} from '../lib/mercenary-raid-thread-actions.js';
import { launchPaidMercenaryRaid, refreshMercenaryRaidRun } from '../lib/mercenary-raid-launch.js';
import {
  applyMercenaryRaidThreadRecord,
  buildMercenaryRaidThreadPersistenceSignature,
  resolveInitialMercenaryRaidThreadState,
} from '../lib/mercenary-raid-thread-store.js';

type UseMercenaryRaidOptions = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  paymentEnabled: boolean;
  createFetchWithPayment?: () => Promise<typeof fetch>;
  paymentMode?: 'wallet' | 'api_key';
  apiKeySecret?: string;
  persistThreads?: boolean;
};

export function useMercenaryRaid({
  providers,
  providerHealth,
  paymentEnabled,
  createFetchWithPayment,
  paymentMode = 'wallet',
  apiKeySecret,
  persistThreads = true,
}: UseMercenaryRaidOptions) {
  const initial = resolveInitialMercenaryRaidThreadState(persistThreads);
  const [threadStore, setThreadStore] = useState<MercenaryThreadStore>(initial.store);
  const [activeThreadId, setActiveThreadId] = useState(initial.thread.id);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(initial.thread.maxBudgetUsd);
  const [raidBrief, setRaidBrief] = useState(initial.thread.raidBrief);
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(
    initial.thread.lastSubmittedBrief
  );
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(initial.thread.liveRaidRun);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(initial.thread.launchError);
  const { copied: receiptCopied, copyText: copyReceiptText } = useCopyFeedback();
  const [expandedArtifact, setExpandedArtifact] = useState<SubmissionArtifact | null>(null);
  const [runtimeAttestation, setRuntimeAttestation] =
    useState<AttestedEnvelope<AttestedRuntimePayload> | null>(null);
  const [runtimeAttestationError, setRuntimeAttestationError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const liveRaidRunRef = useRef(liveRaidRun);
  const lastPersistedThreadSignature = useRef('');

  useEffect(() => {
    liveRaidRunRef.current = liveRaidRun;
  }, [liveRaidRun]);

  function buildThreadSnapshot(): MercenaryThreadRecord {
    const existing = findMercenaryThread(threadStore, activeThreadId);
    const title = existing?.titleLocked
      ? existing.title
      : deriveMercenaryThreadTitle({ lastSubmittedBrief, raidBrief });

    return {
      id: activeThreadId,
      title,
      titleLocked: existing?.titleLocked,
      updatedAt: new Date().toISOString(),
      maxBudgetUsd,
      raidBrief,
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
    const applied = applyMercenaryRaidThreadRecord(thread);
    setMaxBudgetUsd(applied.maxBudgetUsd);
    setRaidBrief(applied.raidBrief);
    setLastSubmittedBrief(applied.lastSubmittedBrief);
    setLiveRaidRun(applied.liveRaidRun);
    setLaunchError(applied.launchError);
    setExpandedArtifact(null);
    lastPersistedThreadSignature.current = applied.persistenceSignature;
  }

  const viewState = buildMercenaryRaidViewState({
    raidBrief,
    isLaunching,
    lastSubmittedBrief,
    launchError,
    liveRaidRun,
    providers,
    providerHealth,
    runtimeAttestation,
    runtimeAttestationError,
    paymentEnabled,
    paymentMode,
  });

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
    let inFlight = false;
    const pollTimer = window.setInterval(() => {
      if (inFlight || document.visibilityState === 'hidden') {
        return;
      }
      inFlight = true;
      void refreshLiveRaid(spawn).finally(() => {
        inFlight = false;
      });
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

    const signature = buildMercenaryRaidThreadPersistenceSignature({
      threadId: activeThreadId,
      maxBudgetUsd,
      brief: raidBrief,
      submittedBrief: lastSubmittedBrief,
      run: liveRaidRun,
      error: launchError,
    });

    if (signature === lastPersistedThreadSignature.current) {
      return;
    }

    const persistTimer = window.setTimeout(() => {
      if (signature === lastPersistedThreadSignature.current) {
        return;
      }
      lastPersistedThreadSignature.current = signature;
      commitThreadSnapshot(buildThreadSnapshot());
    }, 500);

    return () => window.clearTimeout(persistTimer);
  }, [
    persistThreads,
    isLaunching,
    activeThreadId,
    maxBudgetUsd,
    raidBrief,
    lastSubmittedBrief,
    liveRaidRun,
    launchError,
  ]);

  async function launchConversation() {
    const submittedBrief = raidBrief.trim();
    if (!submittedBrief || isLaunching || !viewState.canLaunchLiveRaid) {
      return;
    }
    setIsLaunching(true);
    setLaunchError(null);
    setLastSubmittedBrief(submittedBrief);
    setLiveRaidRun(null);

    try {
      const usesApiKey = paymentMode === 'api_key' && Boolean(apiKeySecret?.trim());

      if (!usesApiKey && !paymentEnabled) {
        throw new Error('Payment is not configured on this host. Enable x402 before launching.');
      }

      if (!usesApiKey && !createFetchWithPayment) {
        throw new Error(
          'Connect MetaMask and subscribe to top up account credit before launching.'
        );
      }

      if (usesApiKey && !apiKeySecret?.trim()) {
        throw new Error('Selected API key is missing its secret. Re-save the key from /account.');
      }

      const fetchWithPayment = usesApiKey ? undefined : await createFetchWithPayment?.();
      const launched = await launchPaidMercenaryRaid({
        submittedBrief,
        maxBudgetUsd: Math.max(maxBudgetUsd, 1),
        paymentMode: usesApiKey ? 'api_key' : 'wallet',
        apiKey: apiKeySecret,
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
    const current = liveRaidRunRef.current;
    if (!current || current.spawn.raidId !== spawn.raidId) {
      return;
    }

    const next = await refreshMercenaryRaidRun(spawn, current);
    if (next) {
      setLiveRaidRun((latest) => (latest?.spawn.raidId === spawn.raidId ? next : latest));
    }
  }

  async function copyReceiptLink() {
    if (!liveRaidRun?.spawn.receiptPath) {
      return;
    }

    await copyReceiptText(buildAbsolutePath(liveRaidRun.spawn.receiptPath), 'receipt');
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

  return {
    maxBudgetUsd,
    setMaxBudgetUsd,
    raidBrief,
    setRaidBrief,
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
    ...viewState,
  };
}
