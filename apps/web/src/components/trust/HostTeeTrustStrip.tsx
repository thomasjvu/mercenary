import useSWR from 'swr';
import { fetchHostAttestationOptional } from '../../api/host-attestation.js';
import { fetchReady } from '../../api/health.js';
import { useAttestationInspector } from '../../contexts/AttestationInspectorContext.js';
import { buildRuntimeAttestationLabel } from '../../mercenary-result.js';

type HostTeeTrustStripProps = {
  variant?: 'strip' | 'inline' | 'sidebar';
};

export function HostTeeTrustStrip({ variant = 'strip' }: HostTeeTrustStripProps) {
  const { openInspector } = useAttestationInspector();
  const ready = useSWR('host-ready', fetchReady, { refreshInterval: 30_000 });
  const hostAttestation = useSWR('host-attestation', fetchHostAttestationOptional, {
    refreshInterval: 30_000,
    shouldRetryOnError: false,
  });

  const tee = hostAttestation.data?.teeAttestation;
  const signedRuntime = hostAttestation.data?.signedRuntime;
  const deploymentTarget =
    hostAttestation.data?.deploymentTarget ?? ready.data?.gates?.tee.platform ?? null;
  const teePlatform = hostAttestation.data?.teePlatform ?? ready.data?.gates?.tee.platform ?? null;
  const teeSocketLive =
    ready.data?.gates?.tee.socketMounted === true || ready.data?.gates?.tee.pathExists === true;
  const hostVerified = Boolean(hostAttestation.data?.verified && (tee?.valid || signedRuntime));
  const proofPending = !hostVerified && !hostAttestation.isLoading && !hostAttestation.data;

  const label = buildRuntimeAttestationLabel(
    deploymentTarget ?? (teeSocketLive ? 'tee host' : 'pending'),
    teePlatform ?? (teeSocketLive ? 'tee platform' : 'pending')
  );

  const className =
    variant === 'inline'
      ? 'host-tee-trust host-tee-trust--inline'
      : variant === 'sidebar'
        ? 'host-tee-trust host-tee-trust--sidebar'
        : 'host-tee-trust host-tee-trust--strip';

  return (
    <section aria-label="Host TEE verification" className={className}>
      <div className="host-tee-trust__chips">
        <span
          className={`host-tee-trust__chip${hostVerified ? ' host-tee-trust__chip--ready' : ''}`}
        >
          {label}
        </span>
        {teeSocketLive ? (
          <span className="host-tee-trust__chip host-tee-trust__chip--ready">TEE socket live</span>
        ) : null}
        {proofPending ? (
          <span className="host-tee-trust__chip host-tee-trust__chip--pending">
            host proof pending
          </span>
        ) : null}
      </div>
      <button className="host-tee-trust__link" onClick={() => openInspector()} type="button">
        view attestation
      </button>
    </section>
  );
}
