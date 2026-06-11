import { API_BASE } from '../api/client.js';

export type ReceiptQuery = {
  raidId: string;
  token: string;
};

export function buildReceiptPath(query: ReceiptQuery): string {
  const params = new URLSearchParams({
    raidId: query.raidId,
    token: query.token,
  });
  return `/receipt?${params.toString()}`;
}

export function buildReceiptUrl(query: ReceiptQuery): string {
  return new URL(buildReceiptPath(query), window.location.origin).toString();
}

export function readReceiptQuery(): ReceiptQuery | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const raidId = params.get('raidId') ?? params.get('raid_id') ?? '';
  const token =
    params.get('token') ?? params.get('raidAccessToken') ?? params.get('raid_access_token') ?? '';

  if (!raidId || !token) {
    return null;
  }

  return { raidId, token };
}

export function buildAgentManifestUrl(): string {
  return `${API_BASE}/v1/agent.json`;
}

export function buildAttestedRuntimeUrl(): string {
  return `${API_BASE}/v1/attested-runtime`;
}

export function buildAttestedResultUrl(query: ReceiptQuery): string {
  return `${API_BASE}/v1/raid/${encodeURIComponent(query.raidId)}/attested-result?token=${encodeURIComponent(query.token)}`;
}

export function buildAgentLogUrl(query: ReceiptQuery): string {
  return `${API_BASE}/v1/raids/${encodeURIComponent(query.raidId)}/agent_log.json?token=${encodeURIComponent(query.token)}`;
}

export function buildAttestationSurfaceLabel(
  target: string | null | undefined,
  teePlatform: string | null | undefined
): string {
  const haystack = `${target ?? ''} ${teePlatform ?? ''}`.toLowerCase();
  if (haystack.includes('phala')) {
    return 'Phala TEE-attested';
  }
  if (haystack.includes('eigen')) {
    return 'EigenCompute TEE-attested';
  }
  if (teePlatform != null && teePlatform.trim().length > 0) {
    return `${teePlatform} TEE-attested`;
  }
  return 'TEE-attested';
}

export function isAttestationSignerUnavailable(message: string | undefined): boolean {
  return (
    typeof message === 'string' && message.includes('MNEMONIC environment variable is required')
  );
}
