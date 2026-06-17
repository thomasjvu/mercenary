/** Keep in sync with root package.json version when cutting releases. */
export const APP_VERSION = '0.1.0';

export const APP_RELEASE_CHANNEL = 'beta' as const;

export function releaseChannelLabel(): string {
  return APP_RELEASE_CHANNEL;
}
