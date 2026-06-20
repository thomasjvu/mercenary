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
  fetchHostAttestationOptional,
  type HostAttestationResponse,
} from '../api/host-attestation.js';
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
  hostAttestation: HostAttestationResponse | undefined;
  hostAttestationError: unknown;
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
  const ready = useSWR(isOpen ? 'attestation-inspector-ready' : null, fetchReady, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const hostAttestation = useSWR(
    isOpen ? 'attestation-inspector-host' : null,
    fetchHostAttestationOptional,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
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
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
      hostAttestation: hostAttestation.data,
      hostAttestationError: hostAttestation.error,
      openInspector,
      openProofInspector,
      closeInspector,
    }),
    [
      closeInspector,
      context,
      hostAttestation.data,
      hostAttestation.error,
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
        hostAttestation={hostAttestation.data}
        hostAttestationError={hostAttestation.error}
        isOpen={isOpen}
        modelTee={modelTee.data}
        modelTeeError={modelTee.error}
        modelTeeLoading={modelTee.isLoading}
        onClose={closeInspector}
        ready={ready.data}
        readyError={ready.error}
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
