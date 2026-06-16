import { NETWORK } from '@bossraid/constants';

const PUBLIC_WEB_ORIGIN_ENV = import.meta.env.VITE_BOSSRAID_PUBLIC_WEB_ORIGIN as string | undefined;

export type ConsumerReceiptQuery = {
  raidId: string;
  token: string;
};

function readConfiguredPublicWebOrigin(): string | null {
  const configured = PUBLIC_WEB_ORIGIN_ENV?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : null;
}

export function resolvePublicWebOrigin(): string {
  const configured = readConfiguredPublicWebOrigin();
  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    const { origin, port } = window.location;
    if (port === String(NETWORK.LOCAL_OPS_PORT)) {
      return `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_WEB_PORT}`;
    }
    return origin;
  }

  return `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_WEB_PORT}`;
}

export function buildConsumerPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${resolvePublicWebOrigin()}${normalized}`;
}

export function buildConsumerReceiptUrl(query: ConsumerReceiptQuery): string {
  const params = new URLSearchParams({
    raidId: query.raidId,
    token: query.token,
  });
  return buildConsumerPath(`/verification?${params.toString()}`);
}

export function buildConsumerReceiptPath(query: ConsumerReceiptQuery): string {
  const params = new URLSearchParams({
    raidId: query.raidId,
    token: query.token,
  });
  return `/verification?${params.toString()}`;
}

export const CONSUMER_LINKS = {
  mercenary: () => buildConsumerPath('/mercenary'),
  marketplace: () => buildConsumerPath('/marketplace'),
  playgroundRaid: () => buildConsumerPath('/playground?mode=raid'),
  publicApp: () => resolvePublicWebOrigin(),
} as const;
