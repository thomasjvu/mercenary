import { asSingleHeader } from '@bossraid/shared-types';
import { safeEqualString } from './http.js';

/** Service identity for optional shared work billing. */
export function readTrustedAlkahestClient(
  headers: Record<string, string | string[] | undefined>,
  options: { trustedKey?: string } = {}
): { sourceAppId: 'alkahest' } | undefined {
  const clientId = asSingleHeader(headers['x-bossraid-client-id']);
  const sourceAppId = asSingleHeader(headers['x-bossraid-source-app-id']);
  if (clientId !== 'alkahest' && sourceAppId !== 'alkahest') return undefined;
  const key = options.trustedKey?.trim();
  if (!key || !safeEqualString(asSingleHeader(headers.authorization), `Bearer ${key}`))
    return undefined;
  return { sourceAppId: 'alkahest' };
}
