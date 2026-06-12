import useSWR from 'swr';
import { fetchAttestedRuntime } from '../../api/raid.js';
import { fetchReady } from '../../api/health.js';
import { buildAttestedRuntimeUrl } from '../../lib/receipt-url.js';
import { buildRuntimeAttestationLabel } from '../../demo-result.js';

type HostTeeTrustStripProps = {
  variant?: 'strip' | 'inline';
};

export function HostTeeTrustStrip({ variant = 'strip' }: HostTeeTrustStripProps) {
  const ready = useSWR('host-ready', fetchReady, { refreshInterval: 30_000 });
  const attestedRuntime = useSWR('host-attested-runtime', fetchAttestedRuntime, {
    refreshInterval: 30_000,
    shouldRetryOnError: false,
  });

  const deploymentTarget =
    attestedRuntime.data?.payload.deploymentTarget ?? ready.data?.gates.tee.platform ?? null;
  const teePlatform =
    attestedRuntime.data?.payload.teePlatform ?? ready.data?.gates.tee.platform ?? null;
  const teeSocketLive =
    ready.data?.gates.tee.socketMounted === true || ready.data?.gates.tee.pathExists === true;
  const runtimeSigned = Boolean(attestedRuntime.data?.signature);
  const signerPending = attestedRuntime.error != null && !runtimeSigned;

  const label = buildRuntimeAttestationLabel(
    deploymentTarget ?? (teeSocketLive ? 'tee host' : 'pending'),
    teePlatform ?? (teeSocketLive ? 'tee platform' : 'pending')
  );

  const className =
    variant === 'inline'
      ? 'host-tee-trust host-tee-trust--inline'
      : 'host-tee-trust host-tee-trust--strip';

  return (
    <section aria-label="Host TEE verification" className={className}>
      <div className="host-tee-trust__chips">
        <span
          className={`host-tee-trust__chip${runtimeSigned ? ' host-tee-trust__chip--ready' : ''}`}
        >
          {label}
        </span>
        {teeSocketLive ? (
          <span className="host-tee-trust__chip host-tee-trust__chip--ready">TEE socket live</span>
        ) : null}
        {signerPending ? (
          <span className="host-tee-trust__chip host-tee-trust__chip--pending">
            runtime proof pending
          </span>
        ) : null}
      </div>
      <a
        className="host-tee-trust__link"
        href={buildAttestedRuntimeUrl()}
        rel="noreferrer"
        target="_blank"
      >
        view attestation
      </a>
    </section>
  );
}
