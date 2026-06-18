export function readBountyId(pathname = window.location.pathname): string | undefined {
  const match = pathname.match(/^\/bounties\/([^/]+)\/?$/);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[1]).trim() || undefined;
  } catch {
    return match[1].trim() || undefined;
  }
}

export function isBountiesListPath(pathname = window.location.pathname): boolean {
  return pathname === '/bounties' || pathname === '/bounties/';
}

export function isBountyDetailPath(pathname = window.location.pathname): boolean {
  return readBountyId(pathname) != null;
}

export function bountyDetailPath(bountyId: string): string {
  return `/bounties/${encodeURIComponent(bountyId)}`;
}
