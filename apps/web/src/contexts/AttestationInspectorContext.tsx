import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import useSWR from 'swr';
import type { UpstreamProviderId } from '@bossraid/constants';
import { fetchReady } from '../api/health.js';
import {
  fetchAttestedRuntime,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
} from '../api/raid.js';
import { fetchModelTeeSummary } from '../api/marketplace-tee.js';
import type { ReceiptUpstreamAttestationRow } from '../lib/receipt-attestation-view.js';
import { AttestationInspectorSidebar } from '../components/trust/AttestationInspectorSidebar.js';

export type AttestationInspectorContextInput = {
  raidId?: string;
  modelId?: string;
  provider?: UpstreamProviderId;
  upstreamAttestations?: ReceiptUpstreamAttestationRow[];
};

type AttestationInspectorValue = {
  isOpen: boolean;
  context: AttestationInspectorContextInput;
  lastContext: AttestationInspectorContextInput;
  ready: ReturnType<typeof useSWR>['data'];
  readyError: unknown;
  attestedRuntime: AttestedEnvelope<AttestedRuntimePayload> | undefined;
  attestedRuntimeError: unknown;
  openInspector: (context?: AttestationInspectorContextInput) => void;
  openProofInspector: () => void;
  closeInspector: () => void;
};

const AttestationInspectorContext = createContext<AttestationInspectorValue | null>(null);

function hasInspectorContext(input: AttestationInspectorContextInput): boolean {
  return Boolean(
    input.raidId || input.modelId || input.provider || (input.upstreamAttestations?.length ?? 0) > 0
  );
}

export function AttestationProofSidebarTrigger({ className }: { className?: string }) {
  const { openProofInspector } = useAttestationInspector();

  return (
    <button className={className ?? 'app-sidebar__link'} onClick={openProofInspector} type="button">
      proof
    </button>
  );
}

export function AttestationInspectorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<AttestationInspectorContextInput>({});
  const [lastContext, setLastContext] = useState<AttestationInspectorContextInput>({});
  const ready = useSWR('attestation-inspector-ready', fetchReady, {
    refreshInterval: 30_000,
    shouldRetryOnError: false,
  });
  const attestedRuntime = useSWR('attestation-inspector-runtime', fetchAttestedRuntime, {
    refreshInterval: 30_000,
    shouldRetryOnError: false,
  });
  const modelTee = useSWR(
    isOpen && context.modelId ? ['attestation-inspector-model-tee', context.modelId] : null,
    ([, modelId]: [string, string]) => fetchModelTeeSummary(modelId),
    { shouldRetryOnError: false }
  );

  const openInspector = useCallback((nextContext: AttestationInspectorContextInput = {}) => {
    setContext(nextContext);
    if (hasInspectorContext(nextContext)) {
      setLastContext(nextContext);
    }
    setIsOpen(true);
  }, []);

  const openProofInspector = useCallback(() => {
    setContext(lastContext);
    setIsOpen(true);
  }, [lastContext]);

  const closeInspector = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeInspector();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeInspector, isOpen]);

  const value = useMemo<AttestationInspectorValue>(
    () => ({
      isOpen,
      context,
      lastContext,
      ready: ready.data,
      readyError: ready.error,
      attestedRuntime: attestedRuntime.data,
      attestedRuntimeError: attestedRuntime.error,
      openInspector,
      openProofInspector,
      closeInspector,
    }),
    [
      attestedRuntime.data,
      attestedRuntime.error,
      closeInspector,
      context,
      isOpen,
      lastContext,
      openInspector,
      openProofInspector,
      ready.data,
      ready.error,
    ]
  );

  return (
    <AttestationInspectorContext.Provider value={value}>
      {children}
      <AttestationInspectorSidebar
        context={context}
        isOpen={isOpen}
        modelTee={modelTee.data}
        modelTeeError={modelTee.error}
        modelTeeLoading={modelTee.isLoading}
        onClose={closeInspector}
        ready={ready.data}
        readyError={ready.error}
        runtime={attestedRuntime.data}
        runtimeError={attestedRuntime.error}
      />
    </AttestationInspectorContext.Provider>
  );
}

export function useAttestationInspector(): AttestationInspectorValue {
  const value = useContext(AttestationInspectorContext);
  if (!value) {
    throw new Error('useAttestationInspector must be used within AttestationInspectorProvider');
  }

  return value;
}
