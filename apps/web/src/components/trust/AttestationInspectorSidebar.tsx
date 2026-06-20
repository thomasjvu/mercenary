import type { MarketplaceModelTeeSummaryView } from '@bossraid/shared-types';
import type { AttestedEnvelope, AttestedRuntimePayload } from '../../api/raid.js';
import type { ReadyResponse } from '../../api/health.js';
import { buildRuntimeAttestationLabel } from '../../mercenary-result.js';
import { buildAttestedRuntimeUrl, buildAgentManifestUrl } from '../../lib/receipt-url.js';
import type { AttestationInspectorContextInput } from '../../contexts/AttestationInspectorContext.js';
import type { ReceiptUpstreamAttestationRow } from '../../lib/receipt-attestation-view.js';
import { ReceiptUpstreamAttestationPanel } from '../receipt/ReceiptUpstreamAttestationPanel.js';
import { CopyableAddress } from './CopyableAddress.js';

type AttestationInspectorSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  context: AttestationInspectorContextInput;
  ready: ReadyResponse | undefined;
  readyError: unknown;
  runtime: AttestedEnvelope<AttestedRuntimePayload> | undefined;
  runtimeError: unknown;
  modelTee: MarketplaceModelTeeSummaryView | undefined;
  modelTeeError: unknown;
  modelTeeLoading: boolean;
};

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="attestation-inspector__signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InspectorContextHeader({ context }: { context: AttestationInspectorContextInput }) {
  if (!context.raidId && !context.modelId && !context.provider) {
    return (
      <section className="attestation-inspector__panel attestation-inspector__panel--context">
        <p className="attestation-inspector__section-label">context</p>
        <p className="attestation-inspector__note">
          Host runtime proof. Open from a model or receipt for upstream context.
        </p>
      </section>
    );
  }

  return (
    <section className="attestation-inspector__panel attestation-inspector__panel--context">
      <p className="attestation-inspector__section-label">context</p>
      <div className="attestation-inspector__signal-strip">
        {context.raidId ? <SignalRow label="raid" value={context.raidId} /> : null}
        {context.modelId ? <SignalRow label="model" value={context.modelId} /> : null}
        {context.provider ? <SignalRow label="provider" value={context.provider} /> : null}
      </div>
    </section>
  );
}

export function AttestationInspectorSidebar({
  isOpen,
  onClose,
  context,
  ready,
  readyError,
  runtime,
  runtimeError,
  modelTee,
  modelTeeError,
  modelTeeLoading,
}: AttestationInspectorSidebarProps) {
  const deploymentTarget =
    runtime?.payload.deploymentTarget ?? ready?.gates.tee.platform ?? 'pending';
  const teePlatform = runtime?.payload.teePlatform ?? ready?.gates.tee.platform ?? 'pending';
  const teeSocketLive =
    ready?.gates.tee.socketMounted === true || ready?.gates.tee.pathExists === true;
  const runtimeSigned = Boolean(runtime?.signature);
  const runtimeLabel = buildRuntimeAttestationLabel(deploymentTarget, teePlatform);
  const upstreamRows = context.upstreamAttestations ?? [];

  return (
    <>
      <button
        className={`attestation-inspector__backdrop${isOpen ? ' attestation-inspector__backdrop--open' : ''}`}
        hidden={!isOpen}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />
      <aside
        aria-label="Attestation inspector"
        className={`attestation-inspector${isOpen ? ' attestation-inspector--open' : ''}`}
        inert={!isOpen ? true : undefined}
      >
        <div className="attestation-inspector__head">
          <div>
            <p className="eyebrow">proof</p>
            <h2>Attestation</h2>
          </div>
          <button className="button" onClick={onClose} tabIndex={isOpen ? 0 : -1} type="button">
            close
          </button>
        </div>

        <InspectorContextHeader context={context} />

        <section className="attestation-inspector__panel attestation-inspector__panel--compact">
          <p className="attestation-inspector__section-label">host runtime</p>
          <div className="attestation-inspector__summary">
            <strong>{runtimeLabel}</strong>
            <span>
              {runtimeSigned ? 'signed' : 'unsigned'} · tee {teeSocketLive ? 'live' : 'offline'} ·{' '}
              {runtime
                ? `${runtime.payload.readyProviders}/${runtime.payload.providers} ready`
                : 'loading'}
            </span>
          </div>
          {runtime?.signer ? (
            <CopyableAddress label="runtime signer" value={runtime.signer} />
          ) : null}
          {runtimeError && !runtime ? (
            <p className="attestation-inspector__note">
              {runtimeError instanceof Error
                ? runtimeError.message
                : 'Runtime attestation is not published yet.'}
            </p>
          ) : null}
          {readyError && !ready ? (
            <p className="attestation-inspector__note">
              {readyError instanceof Error ? readyError.message : 'Host readiness unavailable.'}
            </p>
          ) : null}
          <div className="attestation-inspector__links">
            <a href={buildAttestedRuntimeUrl()} rel="noreferrer" target="_blank">
              runtime json
            </a>
            <a href={buildAgentManifestUrl()} rel="noreferrer" target="_blank">
              mercenary manifest
            </a>
          </div>
        </section>

        {context.modelId ? (
          <section className="attestation-inspector__panel">
            <p className="attestation-inspector__section-label">upstream tee</p>
            <p className="attestation-inspector__note">
              {context.provider ?? modelTee?.provider ?? 'upstream'} · {context.modelId}
            </p>
            {modelTeeLoading && !modelTee && !modelTeeError ? (
              <p className="attestation-inspector__note attestation-inspector__note--loading">
                Loading upstream TEE summary…
              </p>
            ) : null}
            {modelTee?.lastAttestation ? (
              <>
                <div className="attestation-inspector__signal-strip">
                  <SignalRow
                    label="status"
                    value={modelTee.lastAttestation.valid ? 'verified' : 'failed'}
                  />
                </div>
                {modelTee.lastAttestation.signingAddress ? (
                  <CopyableAddress
                    label="signing address"
                    value={modelTee.lastAttestation.signingAddress}
                  />
                ) : null}
                {modelTee.lastAttestation.checks && modelTee.lastAttestation.checks.length > 0 ? (
                  <ul className="upstream-tee-panel__checks">
                    {modelTee.lastAttestation.checks.map((check) => (
                      <li
                        className={
                          check.passed
                            ? 'upstream-tee-panel__check--pass'
                            : 'upstream-tee-panel__check--fail'
                        }
                        key={check.id}
                      >
                        {check.passed ? '✓' : '✗'} {check.detail ?? check.id}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {modelTee.lastAttestation.explorerUrl ? (
                  <a
                    className="upstream-tee-panel__link"
                    href={modelTee.lastAttestation.explorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    open upstream proof explorer
                  </a>
                ) : null}
              </>
            ) : modelTeeError ? (
              <p className="attestation-inspector__note">
                {modelTeeError instanceof Error
                  ? modelTeeError.message
                  : 'Upstream TEE summary unavailable.'}
              </p>
            ) : modelTeeLoading ? null : (
              <p className="attestation-inspector__note">No cached upstream TEE summary yet.</p>
            )}
          </section>
        ) : null}

        {upstreamRows.length > 0 ? (
          <section className="attestation-inspector__panel">
            <p className="attestation-inspector__section-label">raid upstream proof</p>
            {upstreamRows.map((row) =>
              row.attestation.teeAttestation?.signingAddress ? (
                <CopyableAddress
                  key={`${row.providerId}-signing`}
                  label={`${row.displayName} signing`}
                  value={row.attestation.teeAttestation.signingAddress}
                />
              ) : null
            )}
            <ReceiptUpstreamAttestationPanel rows={upstreamRows} />
          </section>
        ) : null}
      </aside>
    </>
  );
}
