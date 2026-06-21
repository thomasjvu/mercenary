import type { MarketplaceModelTeeSummaryView } from '@bossraid/shared-types';
import type { HostAttestationResponse } from '../../api/host-attestation.js';
import type { ReadyResponse } from '../../api/health.js';
import { buildRuntimeAttestationLabel } from '../../mercenary-result.js';
import { buildAgentManifestUrl, buildHostAttestationUrl } from '../../lib/receipt-url.js';
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
  hostAttestation: HostAttestationResponse | undefined;
  hostAttestationError: unknown;
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
  hostAttestation,
  hostAttestationError,
  modelTee,
  modelTeeError,
  modelTeeLoading,
}: AttestationInspectorSidebarProps) {
  const tee = hostAttestation?.teeAttestation;
  const signedRuntime = hostAttestation?.signedRuntime;
  const deploymentTarget =
    hostAttestation?.deploymentTarget ?? ready?.gates?.tee.platform ?? 'pending';
  const teePlatform = hostAttestation?.teePlatform ?? ready?.gates?.tee.platform ?? 'pending';
  const teeSocketLive =
    ready?.gates?.tee.socketMounted === true || ready?.gates?.tee.pathExists === true;
  const teeVerified = Boolean(
    hostAttestation?.teeVerified ?? hostAttestation?.verified ?? tee?.valid
  );
  const runtimeSigned = Boolean(hostAttestation?.runtimeSigned ?? signedRuntime);
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
              {teeVerified ? 'tee verified' : runtimeSigned ? 'runtime signed' : 'pending'} · tee{' '}
              {teeSocketLive ? 'live' : 'offline'}
              {signedRuntime
                ? ` · ${signedRuntime.payload.readyProviders}/${signedRuntime.payload.providers} ready`
                : ''}
            </span>
          </div>

          {tee ? (
            <>
              <div className="attestation-inspector__signal-strip">
                <SignalRow label="quote" value={tee.valid ? 'verified' : 'failed'} />
                {tee.vendor ? <SignalRow label="vendor" value={tee.vendor} /> : null}
                {tee.runtimeMode ? <SignalRow label="runtime" value={tee.runtimeMode} /> : null}
              </div>
              {tee.signingAddress ? (
                <CopyableAddress label="quote signing address" value={tee.signingAddress} />
              ) : null}
              {tee.checks && tee.checks.length > 0 ? (
                <ul className="upstream-tee-panel__checks">
                  {tee.checks.map((check) => (
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
              {tee.explorerUrl ? (
                <a
                  className="upstream-tee-panel__link"
                  href={tee.explorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  open Phala quote explorer
                </a>
              ) : null}
            </>
          ) : null}

          {signedRuntime ? (
            <section className="attestation-inspector__panel attestation-inspector__panel--nested">
              <p className="attestation-inspector__section-label">signed runtime envelope</p>
              <CopyableAddress label="runtime signer" value={signedRuntime.signer} />
              <div className="attestation-inspector__signal-strip">
                <SignalRow
                  label="providers"
                  value={`${signedRuntime.payload.readyProviders}/${signedRuntime.payload.providers}`}
                />
              </div>
            </section>
          ) : null}

          {hostAttestationError && !hostAttestation ? (
            <p className="attestation-inspector__note">
              {hostAttestationError instanceof Error
                ? hostAttestationError.message
                : 'Host TEE attestation is not available on this deployment.'}
            </p>
          ) : null}
          {readyError && !ready ? (
            <p className="attestation-inspector__note">
              {readyError instanceof Error ? readyError.message : 'Host readiness unavailable.'}
            </p>
          ) : null}
          <div className="attestation-inspector__links">
            <a href={buildHostAttestationUrl()} rel="noreferrer" target="_blank">
              host attestation json
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
