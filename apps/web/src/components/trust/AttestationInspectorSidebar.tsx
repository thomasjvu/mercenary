import type { UpstreamProviderId } from '@bossraid/constants';
import type { AttestedEnvelope, AttestedRuntimePayload } from '../../api/raid.js';
import type { ReadyResponse } from '../../api/health.js';
import { buildRuntimeAttestationLabel } from '../../demo-result.js';
import { buildAttestedRuntimeUrl, buildAgentManifestUrl } from '../../lib/receipt-url.js';
import type { AttestationInspectorContextInput } from '../../contexts/AttestationInspectorContext.js';
import type { ReceiptUpstreamAttestationRow } from '../../lib/receipt-attestation-view.js';
import { ReceiptUpstreamAttestationPanel } from '../receipt/ReceiptUpstreamAttestationPanel.js';

type ModelTeeSummary = {
  modelId: string;
  provider: UpstreamProviderId;
  teeAttested: boolean;
  e2ee: boolean;
  lastAttestation: {
    valid: boolean;
    verifiedAt: string;
    signingAddress?: string;
    checks?: Array<{ id: string; passed: boolean; detail?: string }>;
    explorerUrl?: string;
  } | null;
};

type AttestationInspectorSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  context: AttestationInspectorContextInput;
  ready: ReadyResponse | undefined;
  readyError: unknown;
  runtime: AttestedEnvelope<AttestedRuntimePayload> | undefined;
  runtimeError: unknown;
  modelTee: ModelTeeSummary | undefined;
  modelTeeError: unknown;
};

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="attestation-inspector__signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
        aria-hidden={!isOpen}
        className={`attestation-inspector__backdrop${isOpen ? ' attestation-inspector__backdrop--open' : ''}`}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />
      <aside
        aria-hidden={!isOpen}
        aria-label="Attestation inspector"
        className={`attestation-inspector${isOpen ? ' attestation-inspector--open' : ''}`}
      >
        <div className="attestation-inspector__head">
          <div>
            <p className="eyebrow">attestation</p>
            <h2>Proof inspector</h2>
          </div>
          <button className="button" onClick={onClose} type="button">
            close
          </button>
        </div>

        <section className="attestation-inspector__panel">
          <p className="attestation-inspector__section-label">host runtime</p>
          <div className="attestation-inspector__signal-strip">
            <SignalRow label="surface" value={runtimeLabel} />
            <SignalRow label="signed" value={runtimeSigned ? 'yes' : 'pending'} />
            <SignalRow label="tee socket" value={teeSocketLive ? 'live' : 'offline'} />
            <SignalRow
              label="providers"
              value={
                runtime
                  ? `${runtime.payload.readyProviders}/${runtime.payload.providers}`
                  : 'loading'
              }
            />
          </div>
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
            {modelTee?.lastAttestation ? (
              <>
                <div className="attestation-inspector__signal-strip">
                  <SignalRow
                    label="status"
                    value={modelTee.lastAttestation.valid ? 'verified' : 'failed'}
                  />
                  {modelTee.lastAttestation.signingAddress ? (
                    <SignalRow label="signing" value={modelTee.lastAttestation.signingAddress} />
                  ) : null}
                </div>
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
            ) : (
              <p className="attestation-inspector__note">Loading upstream TEE summary.</p>
            )}
          </section>
        ) : null}

        {upstreamRows.length > 0 ? (
          <section className="attestation-inspector__panel">
            <p className="attestation-inspector__section-label">raid upstream proof</p>
            <ReceiptUpstreamAttestationPanel rows={upstreamRows} />
          </section>
        ) : null}
      </aside>
    </>
  );
}
