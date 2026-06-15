import { useEffect } from 'react';
import useSWR from 'swr';
import { formatUsd, raidPollingRefreshInterval } from '@bossraid/proof-ui';
import { SettlementProofPanel, useRaidPolling } from '@bossraid/ui';
import heroMangaReceiptImage from '../assets/hero-manga-receipt.jpg';
import { MangaSliceArt } from '../components/system/MangaSliceArt.js';
import {
  fetchAttestedRaidResult,
  fetchAttestedRuntime,
  fetchJson,
  fetchRaidResult,
  fetchRaidStatus,
  type AttestedEnvelope,
  type AttestedRaidResultPayload,
  type AttestedRuntimePayload,
  type Provider,
} from '../api';
import { ReceiptAttestationSection } from '../components/receipt/ReceiptAttestationSection';
import { ReceiptOutputSection } from '../components/receipt/ReceiptOutputSection';
import { ReceiptProviderList } from '../components/receipt/ReceiptProviderList';
import { ReceiptQueryForm } from '../components/receipt/ReceiptQueryForm';
import { SummaryPill } from '@bossraid/ui';
import { useReceiptAttestation } from '../hooks/useReceiptAttestation';
import { useReceiptQuery } from '../hooks/useReceiptQuery';
import { buildReceiptUpstreamAttestations } from '../lib/receipt-attestation-view';
import { buildReceiptProviderRows, readQueryErrorMessage } from '../lib/receipt-helpers';
import { buildReceiptSettlementView } from '../lib/receipt-settlement-view';
import { applyDocumentMeta } from '../lib/document-meta.js';
import { TerminalCodePanel } from '../components/terminal/TerminalCodePanel.js';
import { buildAttestationSurfaceLabel, isAttestationSignerUnavailable } from '../lib/receipt-url';

type AppRoute = '/' | '/playground' | '/raiders' | '/receipt';

type ReceiptPageProps = {
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid' }) => void;
};

const PINNED_PROOF_RECEIPT_URL =
  (import.meta.env.VITE_BOSSRAID_PROOF_RECEIPT_URL as string | undefined)?.trim() ?? '';

export function ReceiptPage({ onNavigate }: ReceiptPageProps) {
  const {
    raidIdInput,
    setRaidIdInput,
    tokenInput,
    setTokenInput,
    activeQuery,
    formError,
    handleLoadReceipt,
    handleCopyLink,
    shareCopied,
  } = useReceiptQuery();

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
  const attestedRuntime = useSWR<AttestedEnvelope<AttestedRuntimePayload>>(
    'receipt-attested-runtime',
    () => fetchAttestedRuntime(),
    {
      revalidateOnFocus: false,
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

  const {
    runtimeSignerDisabled,
    resultSignerDisabled,
    runtimeAttestationStatus,
    resultAttestationStatus,
    attestationTarget,
    attestationTee,
    attestationSurfaceLabel,
  } = useReceiptAttestation({
    attestedRuntime,
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
  const runtimeSignerDisabledForEmpty = isAttestationSignerUnavailable(
    attestedRuntime.error?.message
  );

  return (
    <section className="receipt-shell receipt-shell--viewport" id="receipt">
      <div className="receipt-shell__hero">
        <div className="receipt-shell__copy">
          <p className="eyebrow">shareable receipt</p>
          <h1>
            <span className="directory-hero__headline-line">One raid.</span>
            <span className="directory-hero__headline-line">One receipt.</span>
          </h1>
          <p className="lede receipt-shell__lede">
            Load one run, its result, proof links, and settlement record.
          </p>
          <div className="directory-hero__actions">
            <button
              className="button button--primary"
              disabled={!activeQuery}
              onClick={handleCopyLink}
              type="button"
            >
              {shareCopied ? 'copied' : 'copy link'}
            </button>
            <a
              className="button"
              href="/playground?mode=raid"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/playground', { mode: 'raid' });
              }}
            >
              playground
            </a>
            <a
              className="button"
              href="/raiders"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/raiders');
              }}
            >
              raiders
            </a>
          </div>
        </div>

        <aside className="page-stage-card page-stage-card--receipt page-stage-card--manga">
          <MangaSliceArt className="page-stage-card__art" src={heroMangaReceiptImage} />
          <div className="page-stage-card__scrim" />
          <div className="page-stage-card__copy">
            <p className="eyebrow">{activeQuery ? 'loaded proof lane' : 'proof lane'}</p>
            <strong>{activeQuery ? currentReceiptStatus : 'awaiting receipt'}</strong>
            <p>
              {activeQuery
                ? `${approvedSubmissionCount} approved · ${successfulProviderCount} successful · ${runtimeAttestationStatus} runtime`
                : 'Load one raid to inspect output, proof, settlement, and provider lineage in a single receipt.'}
            </p>
          </div>
          <div className="page-stage-card__summary">
            <SummaryPill label="runtime" value={runtimeAttestationStatus} />
            <SummaryPill label="result" value={activeQuery ? resultAttestationStatus : 'pending'} />
            <SummaryPill
              label="split"
              value={
                payoutPerSuccessfulProvider == null
                  ? 'pending'
                  : `${successfulProviderCount} x ${formatUsd(payoutPerSuccessfulProvider)}`
              }
            />
            <SummaryPill
              label="tee"
              value={`${teeProviderCount}/${routedProviderIds.length || 0}`}
            />
          </div>
        </aside>
      </div>

      <ReceiptQueryForm
        formError={formError}
        onRaidIdChange={setRaidIdInput}
        onSubmit={handleLoadReceipt}
        onTokenChange={setTokenInput}
        raidIdInput={raidIdInput}
        tokenInput={tokenInput}
      />

      <div className="receipt-shell__body">
        {!activeQuery ? (
          <article className="receipt-empty receipt-empty--viewport">
            <p className="eyebrow">capability link</p>
            <h2>Load one raid receipt.</h2>
            <div className="curl-quickstart curl-quickstart--compact">
              <TerminalCodePanel
                code="/receipt?raidId=<raidId>&token=<raidAccessToken>"
                label="receipt url"
                layer="front"
                note="capability link"
                theme="raid"
              />
            </div>
            <div className="receipt-empty__actions">
              {PINNED_PROOF_RECEIPT_URL ? (
                <a className="button button--primary" href={PINNED_PROOF_RECEIPT_URL}>
                  open pinned receipt
                </a>
              ) : null}
              <a
                className="button button--primary"
                href="/playground?mode=raid"
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate('/playground', { mode: 'raid' });
                }}
              >
                spawn raid
              </a>
            </div>
            <details className="receipt-empty__details">
              <summary>runtime attestation notes</summary>
              <p>
                {attestedRuntime.data
                  ? `${buildAttestationSurfaceLabel(
                      attestedRuntime.data.payload.deploymentTarget ?? 'unknown',
                      attestedRuntime.data.payload.teePlatform ?? 'unknown'
                    )} runtime proof is live.`
                  : runtimeSignerDisabledForEmpty
                    ? 'Runtime envelope signing is disabled on this host.'
                    : attestedRuntime.error
                      ? readQueryErrorMessage(attestedRuntime.error)
                      : 'Loading runtime attestation.'}
              </p>
              {PINNED_PROOF_RECEIPT_URL ? null : (
                <p>Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin a proof URL.</p>
              )}
            </details>
          </article>
        ) : null}

        {status.error || result.error ? (
          <article className="receipt-empty receipt-empty--error receipt-empty--viewport">
            <p className="eyebrow">load failed</p>
            <h2>Receipt access was rejected.</h2>
            <p>{status.error?.message ?? result.error?.message}</p>
          </article>
        ) : null}

        {activeQuery && !status.error && !result.error ? (
          <section className="receipt-dashboard receipt-dashboard--scroll">
            <ReceiptOutputSection
              approvedSubmissionCount={approvedSubmissionCount}
              currentReceiptStatus={currentReceiptStatus}
              result={result.data}
            />

            <ReceiptAttestationSection
              activeQuery={activeQuery}
              attestedResult={attestedResult.data}
              attestedRuntime={attestedRuntime.data}
              attestationSurfaceLabel={attestationSurfaceLabel}
              attestationTarget={attestationTarget}
              attestationTee={attestationTee}
              resultAttestationStatus={resultAttestationStatus}
              resultSignerDisabled={resultSignerDisabled}
              routedProviderCount={routedProviderIds.length}
              runtimeAttestationStatus={runtimeAttestationStatus}
              runtimeSignerDisabled={runtimeSignerDisabled}
              settlementExecution={settlementExecution}
              signedProviderCount={signedProviderCount}
              teeProviderCount={teeProviderCount}
              upstreamAttestations={upstreamAttestations}
            />

            <ReceiptProviderList rows={providerRows} />

            <article className="receipt-surface">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">settlement</p>
                  <h2>Settlement</h2>
                </div>
              </div>
              <SettlementProofPanel
                activeRaidId={activeQuery.raidId}
                approvedProviderCount={approvedSubmissionCount}
                erc8004ProviderCount={erc8004ProviderCount}
                payoutPerSuccessfulProvider={payoutPerSuccessfulProvider}
                reputationEvents={reputationEvents}
                resultStatus={currentReceiptStatus}
                routingProof={routingProof}
                routedProviderCount={routedProviderIds.length}
                settlementExecution={settlementExecution}
                settlementWarnings={settlementWarnings}
                successfulProviderCount={successfulProviderCount}
                variant="receipt"
                veniceProviderCount={veniceProviderCount}
                verifiedErc8004ProviderCount={verifiedErc8004ProviderCount}
              />
            </article>
          </section>
        ) : null}
      </div>
    </section>
  );
}
