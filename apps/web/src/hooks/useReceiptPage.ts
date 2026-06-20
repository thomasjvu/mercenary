import { useEffect } from 'react';
import useSWR from 'swr';
import { raidPollingRefreshInterval } from '@bossraid/proof-ui';
import { useRaidPolling } from '@bossraid/ui';
import {
  fetchAttestedRaidResult,
  fetchJson,
  fetchRaidResult,
  fetchRaidStatus,
  type AttestedEnvelope,
  type AttestedRaidResultPayload,
  type Provider,
} from '../api';
import {
  fetchHostAttestationOptional,
  type HostAttestationResponse,
} from '../api/host-attestation.js';
import { buildReceiptUpstreamAttestations } from '../lib/receipt-attestation-view.js';
import { buildReceiptProviderRows } from '../lib/receipt-helpers.js';
import { buildReceiptSettlementView } from '../lib/receipt-settlement-view.js';
import { applyDocumentMeta } from '../lib/document-meta.js';
import { useReceiptAttestation } from './useReceiptAttestation.js';
import { useReceiptQuery } from './useReceiptQuery.js';

export function useReceiptPage() {
  const query = useReceiptQuery();
  const { activeQuery } = query;

  const { status, result } = useRaidPolling(activeQuery?.raidId, activeQuery?.token, {
    enabled: Boolean(activeQuery),
    fetchStatus: () => fetchRaidStatus(activeQuery!.raidId, activeQuery!.token),
    fetchResult: () => fetchRaidResult(activeQuery!.raidId, activeQuery!.token),
  });
  const providers = useSWR<Provider[]>(
    activeQuery ? '/v1/providers' : null,
    (path: string) => fetchJson(path),
    {
      revalidateOnFocus: false,
    }
  );
  const hostAttestation = useSWR<HostAttestationResponse | undefined>(
    activeQuery ? 'receipt-host-attestation' : null,
    () => fetchHostAttestationOptional(),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const attestedResult = useSWR<AttestedEnvelope<AttestedRaidResultPayload>>(
    activeQuery
      ? (['receipt-attested-result', activeQuery.raidId, activeQuery.token] as const)
      : null,
    ([, raidId, token]: readonly [string, string, string]) =>
      fetchAttestedRaidResult(raidId, token),
    {
      refreshInterval: () =>
        raidPollingRefreshInterval({
          enabled: Boolean(activeQuery),
          status: status.data?.status,
        }),
      revalidateOnFocus: true,
    }
  );

  const attestation = useReceiptAttestation({
    hostAttestation,
    attestedResult,
    activeQuery,
  });

  const settlementView = buildReceiptSettlementView({
    result: result.data,
    providers: providers.data,
  });
  const {
    approvedProviders,
    supportingProviders,
    droppedProviders,
    settlementExecution,
    routingProof,
    routingDecisionMap,
    routedProviderIds,
    erc8004ProviderCount,
    verifiedErc8004ProviderCount,
    veniceProviderCount,
    teeProviderCount,
    signedProviderCount,
    approvedSubmissionCount,
    successfulProviderCount,
    payoutPerSuccessfulProvider,
    settlementWarnings,
    reputationEvents,
    providerMap,
  } = settlementView;
  const currentReceiptStatus = result.data?.status ?? status.data?.status ?? 'loading';

  useEffect(() => {
    if (!activeQuery) {
      applyDocumentMeta({
        title: 'Boss Raid · Shareable receipt',
        description: 'Load one raid receipt with output, provider proof, and settlement record.',
      });
      return;
    }

    const shortRaidId =
      activeQuery.raidId.length > 12 ? `${activeQuery.raidId.slice(0, 12)}…` : activeQuery.raidId;
    const description = `Boss Raid receipt ${shortRaidId}. Status: ${currentReceiptStatus}. ${approvedSubmissionCount} approved · ${successfulProviderCount} successful providers.`;

    applyDocumentMeta({
      title: `Boss Raid receipt · ${shortRaidId} · ${currentReceiptStatus}`,
      description,
      ogTitle: `Boss Raid receipt · ${currentReceiptStatus}`,
      ogDescription: description,
    });
  }, [activeQuery, approvedSubmissionCount, currentReceiptStatus, successfulProviderCount]);

  const providerRows = buildReceiptProviderRows(
    routedProviderIds,
    routingDecisionMap,
    providerMap,
    approvedProviders,
    supportingProviders,
    droppedProviders
  );
  const upstreamAttestations = buildReceiptUpstreamAttestations({
    result: result.data,
    providers: providers.data,
  });
  const runtimeSignerDisabledForEmpty =
    Boolean(hostAttestation.data?.teeAttestation?.valid) && !hostAttestation.data?.signedRuntime;

  return {
    ...query,
    status,
    result,
    hostAttestation,
    attestedResult,
    ...attestation,
    settlementExecution,
    routingProof,
    routedProviderIds,
    erc8004ProviderCount,
    verifiedErc8004ProviderCount,
    veniceProviderCount,
    teeProviderCount,
    signedProviderCount,
    approvedSubmissionCount,
    successfulProviderCount,
    payoutPerSuccessfulProvider,
    settlementWarnings,
    reputationEvents,
    currentReceiptStatus,
    providerRows,
    upstreamAttestations,
    runtimeSignerDisabledForEmpty,
  };
}

export type ReceiptPageState = ReturnType<typeof useReceiptPage>;
