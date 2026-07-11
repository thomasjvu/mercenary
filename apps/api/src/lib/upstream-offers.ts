import { randomUUID } from 'node:crypto';
import {
  buildHarnessProfile,
  defaultModelBaseForHarness,
  type HarnessKind,
} from '@bossraid/agent-harness';
import { INFERENCE_MODEL_CATALOG, UPSTREAM_PROVIDER_CONFIG } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import {
  defaultApiChatHarnessProfile,
  type ProviderRegistrationInput,
} from '@bossraid/shared-types';
import {
  buildUpstreamSellerProviderId,
  resolveInferenceGatewayProviderEndpoint,
} from './inference-gateway.js';

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

export type HostedOfferLane = 'chat' | 'harness';

export function buildHostedProviderRegistration(input: {
  provider: UpstreamProviderId;
  wallet: string;
  modelId: string;
  displayName?: string;
  discountPercent: number;
  payoutWallet: string;
  env?: NodeJS.ProcessEnv;
  /** chat = single completion; harness = multi-step tool loop on platform fleet (no per-seller Phala). */
  lane?: HostedOfferLane;
}): ProviderRegistrationInput | undefined {
  const rates = deriveDiscountedTokenRates({
    modelId: input.modelId,
    discountPercent: input.discountPercent,
  });
  if (!rates) {
    return undefined;
  }

  const lane: HostedOfferLane = input.lane === 'harness' ? 'harness' : 'chat';
  const harnessKind = harnessKindForUpstream(input.provider);
  if (lane === 'harness' && harnessKind === 'off') {
    return undefined;
  }

  const agentIdBase = buildUpstreamSellerProviderId(input.provider, input.wallet, input.modelId);
  const providerId = lane === 'harness' ? `${agentIdBase}-harness`.slice(0, 96) : agentIdBase;
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === input.modelId);
  const attestationVendor = catalogEntry?.attestationVendor ?? input.provider;
  const framework = resolveAgentFrameworkForUpstream(input.provider);
  const planProvider = catalogEntry?.modelProvider ?? input.provider;
  const modelApiBase =
    input.env?.[`BOSSRAID_${input.provider.toUpperCase()}_API_BASE`]?.trim() ||
    (harnessKind !== 'off' ? defaultModelBaseForHarness(harnessKind) : undefined) ||
    UPSTREAM_PROVIDER_CONFIG[input.provider].upstreamBase;

  const harnessProfile =
    lane === 'harness' && harnessKind !== 'off'
      ? buildHarnessProfile({
          kind: harnessKind,
          installation: 'fresh',
          skills: [],
          modelId: rates.upstreamModelId,
          modelApiBase,
          planProvider,
          maxSteps: 10,
          allowShell: false,
        })
      : defaultApiChatHarnessProfile({
          framework,
          planProvider,
          verification: 'unverified',
        });

  return {
    agentId: providerId,
    name:
      (input.displayName ?? catalogEntry?.displayName ?? input.modelId) +
      (lane === 'harness' ? ' (harness)' : ''),
    endpoint: resolveInferenceGatewayProviderEndpoint(providerId, input.env),
    capabilities:
      lane === 'harness' ? ['inference', 'text', 'patch', 'agent'] : ['inference', 'text'],
    supportedLanguages: ['text', 'typescript', 'python'],
    supportedFrameworks: ['openai_compatible', 'node'],
    outputTypes: lane === 'harness' ? ['text', 'json', 'patch'] : ['text', 'json'],
    agentFramework: framework,
    modelFamily: input.provider,
    modelProvider: planProvider,
    modelId: input.modelId,
    maxConcurrency: lane === 'harness' ? 1 : 2,
    source: {
      type: lane === 'harness' ? 'harness_hosted' : 'inference_hosted',
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
      rateCardVersion: `${input.provider}-hosted-${lane}-v1`,
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
    harnessProfile,
  };
}

export function harnessKindForUpstream(provider: UpstreamProviderId): HarnessKind {
  if (provider === 'xai') return 'grok';
  if (provider === 'zai') return 'glm';
  if (provider === 'chutes') return 'chutes';
  // OpenAI-compatible hosted keys (redpill/near/phala/venice) use codex-style tool loop.
  if (
    provider === 'venice' ||
    provider === 'redpill' ||
    provider === 'near' ||
    provider === 'phala'
  ) {
    return 'codex';
  }
  return 'off';
}

function resolveAgentFrameworkForUpstream(
  provider: UpstreamProviderId
): 'grok' | 'glm' | 'chutes' | 'codex' | 'custom' {
  if (provider === 'xai') return 'grok';
  if (provider === 'zai') return 'glm';
  if (provider === 'chutes') return 'chutes';
  if (
    provider === 'venice' ||
    provider === 'redpill' ||
    provider === 'near' ||
    provider === 'phala'
  ) {
    return 'codex';
  }
  return 'custom';
}

export function createGatewayAuthToken(): string {
  return `gw_${randomUUID().replace(/-/g, '')}`;
}
