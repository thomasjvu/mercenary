import { verifyProviderAuth } from '@bossraid/provider-sdk';
import { asSingleHeader } from '@bossraid/shared-types';
import { safeEqualString } from '../../lib/http.js';
import { type ApiContext } from '../../api-context.js';

export function createProviderAuth(ctx: ApiContext) {
  function providerIsAuthorized(
    providerId: string,
    request: {
      method: string;
      path: string;
      body: unknown;
      bodyText?: string;
      headers: Record<string, string | string[] | undefined>;
    }
  ): boolean {
    const provider = ctx.orchestrator
      .listProviders()
      .find((item) => item.providerId === providerId);
    if (!provider) {
      return false;
    }

    return verifyProviderAuth({
      auth: provider.auth,
      providerId,
      method: request.method,
      path: request.path,
      body: request.bodyText ?? JSON.stringify(request.body ?? {}),
      headers: request.headers,
      authorizationHeader: asSingleHeader(request.headers.authorization),
      timestampHeader: asSingleHeader(request.headers['x-bossraid-timestamp']),
      signatureHeader: asSingleHeader(request.headers['x-bossraid-signature']),
      providerIdHeader: asSingleHeader(request.headers['x-bossraid-provider-id']),
    });
  }

  function registryIsAuthorized(headers: Record<string, string | string[] | undefined>): boolean {
    if (!ctx.registryToken) {
      return false;
    }

    const token = asSingleHeader(headers.authorization)?.replace(/^Bearer\s+/i, '');
    return Boolean(token && safeEqualString(token, ctx.registryToken));
  }

  return {
    providerIsAuthorized,
    registryIsAuthorized,
  };
}
