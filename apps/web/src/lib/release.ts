/** Keep in sync with root package.json version when cutting releases. */
export const APP_VERSION = '0.1.0';

export const APP_RELEASE_CHANNEL = 'beta' as const;

/** Base URL for GitHub release tags. Set `gitTag` on changelog entries when tags are cut. */
export const GITHUB_RELEASES_BASE = 'https://github.com/thomasjvu/mercenary/releases/tag';

export function releaseChannelLabel(): string {
  return APP_RELEASE_CHANNEL;
}

export function releaseTagUrl(gitTag: string): string {
  return `${GITHUB_RELEASES_BASE}/${encodeURIComponent(gitTag)}`;
}

export function releaseAnchorId(version: string): string {
  return `release-v${version.replace(/\./g, '-')}`;
}
