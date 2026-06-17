import { CHANGELOG_RELEASES, type ChangelogRelease } from '../content/changelog.js';

export function changelogVersionPath(version: string): string {
  return `/changelog/${version}`;
}

export function readChangelogVersion(pathname: string): string | null {
  const prefix = '/changelog/';
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const version = pathname.slice(prefix.length);
  if (!version || version.includes('/')) {
    return null;
  }

  return findChangelogRelease(version) ? version : null;
}

export function isChangelogPath(pathname: string): boolean {
  return pathname === '/changelog' || readChangelogVersion(pathname) !== null;
}

export function findChangelogRelease(version: string): ChangelogRelease | undefined {
  return CHANGELOG_RELEASES.find((release) => release.version === version);
}

export function latestChangelogRelease(): ChangelogRelease {
  return CHANGELOG_RELEASES[0];
}
