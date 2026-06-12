import { randomUUID } from 'node:crypto';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { ProviderRegistrationInput } from '@bossraid/shared-types';
import {
  buildUpstreamSellerProviderId,
  resolveInferenceGatewayProviderEndpoint,
} from './inference-gateway-base.js';

export function deriveDiscountedTokenRates(input: { modelId: string; discountPercent: number }):
  | {
      pricePer1mInputTokensUsd: number;
      pricePer1mOutputTokensUsd: number;
      minimumChargeUsd: number;
      maxContextTokens: number;
      upstreamModelId: string;
    }
  | undefined {
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === input.modelId);
  if (!catalogEntry) {
    return undefined;
  }

  const multiplier = Math.max(0, Math.min(100, 100 - input.discountPercent)) / 100;
  const pricePer1mInputTokensUsd = Number((catalogEntry.inputPer1mUsd * multiplier).toFixed(6));
  const pricePer1mOutputTokensUsd = Number((catalogEntry.outputPer1mUsd * multiplier).toFixed(6));
  const minimumChargeUsd = Math.max(0.01, Number((pricePer1mInputTokensUsd * 0.001).toFixed(4)));

  return {
    pricePer1mInputTokensUsd,
    pricePer1mOutputTokensUsd,
    minimumChargeUsd,
    maxContextTokens: catalogEntry.maxContextTokens,
    upstreamModelId: catalogEntry.upstreamModelId,
  };
}

export function buildHostedProviderRegistration(input: {
  provider: UpstreamProviderId;
  wallet: string;
  modelId: string;
  displayName?: string;
  discountPercent: number;
  payoutWallet: string;
  env?: NodeJS.ProcessEnv;
}): ProviderRegistrationInput | undefined {
  const rates = deriveDiscountedTokenRates({
    modelId: input.modelId,
    discountPercent: input.discountPercent,
  });
  if (!rates) {
    return undefined;
  }

  const providerId = buildUpstreamSellerProviderId(input.provider, input.wallet, input.modelId);
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === input.modelId);
  const attestationVendor = catalogEntry?.attestationVendor ?? input.provider;

  return {
    agentId: providerId,
    name: input.displayName ?? catalogEntry?.displayName ?? input.modelId,
    endpoint: resolveInferenceGatewayProviderEndpoint(providerId, input.env),
    capabilities: ['inference', 'text'],
    supportedLanguages: ['text'],
    supportedFrameworks: ['openai_compatible'],
    outputTypes: ['text', 'json'],
    agentFramework: 'custom',
    modelFamily: input.provider,
    modelProvider: catalogEntry?.modelProvider ?? input.provider,
    modelId: input.modelId,
    maxConcurrency: 2,
    source: {
      type: 'inference_hosted',
      targetType: input.provider,
      externalRef: input.wallet.toLowerCase(),
    },
    privacy: {
      signedOutputs: true,
      noDataRetention: catalogEntry?.privacy === 'private' || catalogEntry?.privacy === 'tee',
      teeAttested: catalogEntry?.teeAttested ?? false,
      e2ee: catalogEntry?.e2ee ?? false,
      teeVendor: attestationVendor,
    },
    erc8004: {
      agentId: `8004-${providerId}`,
      operatorWallet: input.payoutWallet,
    },
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: rates.pricePer1mInputTokensUsd,
      pricePer1mOutputTokensUsd: rates.pricePer1mOutputTokensUsd,
      minimumChargeUsd: rates.minimumChargeUsd,
      rateCardVersion: `${input.provider}-hosted-v1`,
      upstreamModelId: rates.upstreamModelId,
      maxContextTokens: rates.maxContextTokens,
    },
    auth: {
      type: 'bearer',
      token: createGatewayAuthToken(),
    },
    verification: {
      status: 'pending',
    },
    marketplaceOfferStatus: 'active',
  };
}

export function buildVeniceHostedProviderRegistration(input: {
  wallet: string;
  modelId: string;
  displayName?: string;
  discountPercent: number;
  payoutWallet: string;
  env?: NodeJS.ProcessEnv;
}): ProviderRegistrationInput | undefined {
  const registration = buildHostedProviderRegistration({ ...input, provider: 'venice' });
  if (!registration?.source) {
    return registration;
  }
  return {
    ...registration,
    source: {
      ...registration.source,
      type: 'venice_hosted',
      targetType: 'venice',
    },
  };
}

export function createGatewayAuthToken(): string {
  return `gw_${randomUUID().replace(/-/g, '')}`;
}
