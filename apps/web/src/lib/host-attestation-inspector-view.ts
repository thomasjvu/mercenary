import type { HostAttestationResponse } from '../api/host-attestation.js';
import type { ReadyResponse } from '../api/health.js';

export type HostInspectorChipTone = 'ready' | 'pending' | 'failed' | 'offline';

export type HostInspectorChip = {
  label: string;
  value: string;
  tone: HostInspectorChipTone;
};

export type HostAttestationInspectorView = {
  headline: string;
  subline: string;
  chips: HostInspectorChip[];
  hostContextNote: string;
  loadingMessage: string | null;
  unavailableMessage: string | null;
};

function formatPlatformLabel(
  deploymentTarget: string | null | undefined,
  teePlatform: string | null | undefined
): string {
  const target = deploymentTarget?.trim();
  const platform = teePlatform?.trim();
  if (target && platform && target !== platform) {
    return `${target} · ${platform}`;
  }
  return target || platform || 'host runtime';
}

function quoteChip(
  teeAttestation: HostAttestationResponse['teeAttestation'] | undefined,
  hostLoading: boolean,
  hostUnavailable: boolean
): HostInspectorChip {
  if (hostLoading && !teeAttestation) {
    return { label: 'quote', value: 'fetching', tone: 'pending' };
  }
  if (hostUnavailable) {
    return { label: 'quote', value: 'unavailable', tone: 'offline' };
  }
  if (!teeAttestation) {
    return { label: 'quote', value: 'pending', tone: 'pending' };
  }
  return teeAttestation.valid
    ? { label: 'quote', value: 'verified', tone: 'ready' }
    : { label: 'quote', value: 'failed', tone: 'failed' };
}

function runtimeChip(
  runtimeSigned: boolean,
  hostLoading: boolean,
  hostDataLoaded: boolean
): HostInspectorChip {
  if (hostLoading && !hostDataLoaded) {
    return { label: 'runtime', value: 'fetching', tone: 'pending' };
  }
  return runtimeSigned
    ? { label: 'runtime', value: 'signed', tone: 'ready' }
    : { label: 'runtime', value: 'unsigned', tone: 'pending' };
}

function socketChip(teeSocketLive: boolean, readyLoading: boolean): HostInspectorChip {
  if (readyLoading) {
    return { label: 'socket', value: 'checking', tone: 'pending' };
  }
  return teeSocketLive
    ? { label: 'socket', value: 'live', tone: 'ready' }
    : { label: 'socket', value: 'offline', tone: 'offline' };
}

export function buildHostAttestationInspectorView(input: {
  ready: ReadyResponse | undefined;
  readyLoading: boolean;
  hostAttestation: HostAttestationResponse | undefined;
  hostLoading: boolean;
  hostError: unknown;
  hasRaidContext: boolean;
}): HostAttestationInspectorView {
  const tee = input.hostAttestation?.teeAttestation;
  const signedRuntime = input.hostAttestation?.signedRuntime;
  const deploymentTarget =
    input.hostAttestation?.deploymentTarget ?? input.ready?.gates?.tee.platform ?? null;
  const teePlatform =
    input.hostAttestation?.teePlatform ?? input.ready?.gates?.tee.platform ?? null;
  const teeSocketLive =
    input.ready?.gates?.tee.socketMounted === true || input.ready?.gates?.tee.pathExists === true;
  const teeVerified = Boolean(
    input.hostAttestation?.teeVerified ?? input.hostAttestation?.verified ?? tee?.valid
  );
  const runtimeSigned = Boolean(input.hostAttestation?.runtimeSigned ?? signedRuntime);
  const hostDataLoaded = Boolean(input.hostAttestation);
  const hostUnavailable =
    !input.hostLoading && !hostDataLoaded && input.hostError == null && !teeSocketLive;
  const hostFetchFailed = !input.hostLoading && input.hostError != null;
  const platformLabel = formatPlatformLabel(deploymentTarget, teePlatform);

  const headline = teeVerified
    ? 'Phala TEE verified'
    : runtimeSigned && !tee?.valid && tee
      ? 'Phala host · quote unverified'
      : platformLabel.toLowerCase().includes('phala')
        ? 'Phala host runtime'
        : `${platformLabel} runtime`;

  const chips: HostInspectorChip[] = [
    socketChip(teeSocketLive, input.readyLoading),
    quoteChip(tee, input.hostLoading, hostUnavailable || hostFetchFailed),
    runtimeChip(runtimeSigned, input.hostLoading, hostDataLoaded),
  ];

  let subline = 'Host app proof — TEE quote and optional signed runtime envelope.';
  if (teeVerified && runtimeSigned) {
    subline = 'TEE quote verified and runtime envelope signed.';
  } else if (runtimeSigned && tee?.valid === false) {
    subline = 'Runtime envelope is signed; Phala quote cloud verification failed.';
  } else if (runtimeSigned) {
    subline = 'Runtime envelope signed. Waiting for TEE quote verification.';
  } else if (teeVerified) {
    subline = 'TEE quote verified. Runtime envelope unsigned — MNEMONIC not configured.';
  } else if (tee?.valid === false) {
    subline = 'TEE quote present but verification failed. Runtime may still be unsigned.';
  }

  const hostContextNote = input.hasRaidContext
    ? ''
    : 'This panel shows Boss Raid host proof (app runtime), not upstream inference seller quotes. Open from a receipt or model page for upstream context.';

  const loadingMessage =
    input.hostLoading && !hostDataLoaded
      ? 'Fetching host attestation… first Phala quote can take up to a minute.'
      : input.readyLoading && !input.ready
        ? 'Checking host readiness…'
        : null;

  let unavailableMessage: string | null = null;
  if (hostFetchFailed) {
    unavailableMessage =
      input.hostError instanceof Error
        ? input.hostError.message
        : 'Host TEE attestation is not available on this deployment.';
  } else if (hostUnavailable) {
    unavailableMessage = 'TEE quote unavailable on this host. Socket is offline or not configured.';
  } else if (hostDataLoaded && tee?.valid === false && !runtimeSigned) {
    unavailableMessage =
      'Quote verification failed and runtime envelope is unsigned. Configure MNEMONIC on the API host for signed runtime proof.';
  }

  return {
    headline,
    subline,
    chips,
    hostContextNote,
    loadingMessage,
    unavailableMessage,
  };
}
