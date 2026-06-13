import { isUpstreamProviderId } from '@bossraid/constants';
import { asSingleHeader } from '@bossraid/shared-types';
import type { FastifyRequest } from 'fastify';
import type { ApiControlState } from '../../control-state.js';

export function readPlatformUpstreamApiKey(
  provider: string,
  env: NodeJS.ProcessEnv
): string | undefined {
  if (!isUpstreamProviderId(provider)) {
    return undefined;
  }
  const envKey = `BOSSRAID_${provider.toUpperCase()}_API_KEY`;
  return env[envKey]?.trim() || undefined;
}

export function buildCatalogProviderId(provider: string, modelId: string): string {
  return `catalog:${provider}:${modelId}`;
}

export function readUpstreamApiKeyFromHeaders(
  headers: FastifyRequest['headers']
): string | undefined {
  const headerKey =
    asSingleHeader(headers['x-bossraid-upstream-api-key']) ??
    asSingleHeader(headers['x-venice-api-key']) ??
    asSingleHeader(headers['x-upstream-api-key']);

  return headerKey?.trim() || undefined;
}

export function resolveUpstreamApiKey(input: {
  provider: string;
  env: NodeJS.ProcessEnv;
  request?: FastifyRequest;
  headerApiKey?: string;
}): string | undefined {
  const headerKey =
    input.headerApiKey ??
    (input.request ? readUpstreamApiKeyFromHeaders(input.request.headers) : undefined);
  if (headerKey) {
    return headerKey;
  }

  return readPlatformUpstreamApiKey(input.provider, input.env);
}

export function resolveMarketplaceTeeApiKey(input: {
  provider: string;
  env: NodeJS.ProcessEnv;
  controlState: ApiControlState;
  sellerId?: string;
  sellerWallet?: string;
  sessionWallet?: string;
}): string | undefined {
  if (!isUpstreamProviderId(input.provider)) {
    return undefined;
  }

  const provider = input.provider;
  let apiKey = readPlatformUpstreamApiKey(provider, input.env);

  if (input.sellerId && input.sellerWallet) {
    return (
      input.controlState.readSellerUpstreamApiKey(input.sellerWallet, provider, input.env) ?? apiKey
    );
  }

  if (!apiKey && input.sessionWallet) {
    return input.controlState.readSellerUpstreamApiKey(input.sessionWallet, provider, input.env);
  }

  if (apiKey && input.sessionWallet) {
    return (
      input.controlState.readSellerUpstreamApiKey(input.sessionWallet, provider, input.env) ??
      apiKey
    );
  }

  return apiKey;
}
