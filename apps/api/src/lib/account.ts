import { createHash, randomUUID } from 'node:crypto';
import { ApiContractError } from '@bossraid/api-contracts';
import {
  type ProviderHealthStatus,
  type ProviderProfile,
  type ProviderRegistrationInput,
} from '@bossraid/shared-types';
import { type ApiControlState } from '../control-state.js';

export function buildPublicAuthMessage(nonce: string): string {
  return [
    'Boss Raid public beta sign-in',
    '',
    'Sign this message to create a wallet session. This does not authorize a transaction.',
    '',
    `Nonce: ${nonce}`,
  ].join('\n');
}

export function readNonceFromAuthMessage(message: string): string | undefined {
  return message.match(/Nonce:\s*(nonce_[0-9a-f-]+)/i)?.[1];
}

export function ensureRecordInput(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiContractError(`Expected object for ${label}.`);
  }
  return value as Record<string, unknown>;
}

function ensureOptionalRecordInput(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  if (value == null) {
    return undefined;
  }
  return ensureRecordInput(value, label);
}

export function ensureStringInput(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiContractError(`Expected non-empty string for ${label}.`);
  }
  return value.trim();
}

export function ensureOptionalStringInput(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return ensureStringInput(value, label);
}

export function ensurePositiveNumberInput(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiContractError(`Expected positive number for ${label}.`);
  }
  return parsed;
}

function ensureOptionalStringArrayInput(value: unknown, label: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiContractError(`Expected string array for ${label}.`);
  }
  return value;
}

export function hashBuyerApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizeBuyerApiKey(key: {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  spendLimitUsd?: number;
  spentUsd: number;
  status: string;
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    spendLimitUsd: key.spendLimitUsd,
    spentUsd: key.spentUsd,
    status: key.status,
  };
}

export function enforceBuyerBudget(
  controlState: ApiControlState,
  auth:
    | { type: 'session'; wallet: string; token: string }
    | {
        type: 'api_key';
        wallet: string;
        apiKeyId: string;
        spendLimitUsd?: number;
        spentUsd: number;
      }
    | undefined,
  requestBudgetUsd: number,
  buyerMaxRequestBudgetUsd?: number
): { statusCode: number; error: string; message: string } | undefined {
  if (buyerMaxRequestBudgetUsd != null && requestBudgetUsd > buyerMaxRequestBudgetUsd) {
    return {
      statusCode: 402,
      error: 'budget_exceeds_limit',
      message: `Request budget exceeds the public beta max of $${buyerMaxRequestBudgetUsd.toFixed(
        2
      )}.`,
    };
  }

  if (auth?.type === 'api_key') {
    const account = controlState.readPublicAccount(auth.wallet);
    const spendCapOk =
      auth.spendLimitUsd == null || auth.spentUsd + requestBudgetUsd <= auth.spendLimitUsd;
    const balanceOk = (account?.balanceUsd ?? 0) >= requestBudgetUsd;
    if (!spendCapOk && !balanceOk) {
      return {
        statusCode: 402,
        error: 'api_key_spend_limit_exceeded',
        message: 'API key spend limit or prepaid balance would be exceeded by this request.',
      };
    }
  }

  return undefined;
}

export function buildSelfServeProviderRegistrationInput(
  body: unknown,
  wallet: string,
  existing?: ProviderProfile
): Record<string, unknown> {
  const input = ensureRecordInput(body, 'seller_provider');
  const pricing = ensureOptionalRecordInput(input.pricing, 'seller_provider.pricing') ?? {};
  const payoutWallet =
    ensureOptionalStringInput(input.payoutWallet, 'seller_provider.payoutWallet') ??
    ensureOptionalStringInput(input.payout_wallet, 'seller_provider.payout_wallet') ??
    existing?.erc8004?.operatorWallet ??
    wallet;
  const erc8004Input = ensureOptionalRecordInput(input.erc8004, 'seller_provider.erc8004');
  const erc8004AgentId =
    erc8004Input == null
      ? existing?.erc8004?.agentId
      : (ensureOptionalStringInput(erc8004Input.agentId, 'seller_provider.erc8004.agentId') ??
        ensureOptionalStringInput(erc8004Input.agent_id, 'seller_provider.erc8004.agent_id') ??
        existing?.erc8004?.agentId);
  const agentId =
    ensureOptionalStringInput(input.agentId, 'seller_provider.agentId') ??
    ensureOptionalStringInput(input.agent_id, 'seller_provider.agent_id') ??
    existing?.agentId ??
    `seller-${wallet.slice(2, 8)}-${randomUUID().slice(0, 8)}`;
  const name =
    ensureOptionalStringInput(input.name, 'seller_provider.name') ??
    existing?.displayName ??
    `Seller ${agentId}`;
  const endpoint =
    ensureOptionalStringInput(input.endpoint, 'seller_provider.endpoint') ?? existing?.endpoint;

  if (!endpoint) {
    throw new ApiContractError('Expected non-empty string for seller_provider.endpoint.');
  }

  return {
    agentId,
    name,
    description:
      ensureOptionalStringInput(input.description, 'seller_provider.description') ??
      existing?.description,
    endpoint,
    capabilities: ensureOptionalStringArrayInput(
      input.capabilities,
      'seller_provider.capabilities'
    ) ??
      existing?.specializations ?? ['analysis', 'text'],
    supportedLanguages: ensureOptionalStringArrayInput(
      input.supportedLanguages ?? input.supported_languages,
      'seller_provider.supported_languages'
    ) ??
      existing?.supportedLanguages ?? ['text'],
    supportedFrameworks:
      ensureOptionalStringArrayInput(
        input.supportedFrameworks ?? input.supported_frameworks,
        'seller_provider.supported_frameworks'
      ) ??
      existing?.supportedFrameworks ??
      [],
    outputTypes: ensureOptionalStringArrayInput(
      input.outputTypes ?? input.output_types,
      'seller_provider.output_types'
    ) ??
      existing?.outputTypes ?? ['text', 'json'],
    agentFramework:
      input.agentFramework ?? input.agent_framework ?? existing?.agentFramework ?? 'custom',
    modelProvider: input.modelProvider ?? input.model_provider ?? existing?.modelProvider,
    modelId: input.modelId ?? input.model_id ?? existing?.modelId,
    modelFamily: input.modelFamily ?? input.model_family ?? existing?.modelFamily,
    maxConcurrency: input.maxConcurrency ?? input.max_concurrency ?? existing?.maxConcurrency ?? 1,
    pricing: {
      mode: pricing.mode ?? existing?.pricing?.mode,
      pricePerTaskUsd:
        pricing.pricePerTaskUsd ??
        pricing.price_per_task_usd ??
        input.pricePerTaskUsd ??
        input.price_per_task_usd ??
        existing?.pricing?.pricePerTaskUsd ??
        (pricing.mode === 'token_metered' || existing?.pricing?.mode === 'token_metered'
          ? undefined
          : (existing?.pricePerTaskUsd ?? 1)),
      pricePer1mInputTokensUsd:
        pricing.pricePer1mInputTokensUsd ??
        pricing.price_per_1m_input_tokens_usd ??
        existing?.pricing?.pricePer1mInputTokensUsd,
      pricePer1mOutputTokensUsd:
        pricing.pricePer1mOutputTokensUsd ??
        pricing.price_per_1m_output_tokens_usd ??
        existing?.pricing?.pricePer1mOutputTokensUsd,
      minimumChargeUsd:
        pricing.minimumChargeUsd ??
        pricing.minimum_charge_usd ??
        existing?.pricing?.minimumChargeUsd,
      currency: pricing.currency ?? existing?.pricing?.currency,
      validFrom: pricing.validFrom ?? pricing.valid_from ?? existing?.pricing?.validFrom,
      validUntil: pricing.validUntil ?? pricing.valid_until ?? existing?.pricing?.validUntil,
      rateCardVersion:
        pricing.rateCardVersion ?? pricing.rate_card_version ?? existing?.pricing?.rateCardVersion,
      rateCardHash:
        pricing.rateCardHash ?? pricing.rate_card_hash ?? existing?.pricing?.rateCardHash,
      upstreamModelId:
        pricing.upstreamModelId ?? pricing.upstream_model_id ?? existing?.pricing?.upstreamModelId,
      maxContextTokens:
        pricing.maxContextTokens ??
        pricing.max_context_tokens ??
        existing?.pricing?.maxContextTokens,
    },
    privacy: input.privacy ?? existing?.privacy ?? {},
    erc8004: erc8004AgentId
      ? {
          ...(existing?.erc8004 ?? {}),
          ...(erc8004Input ?? {}),
          agentId: erc8004AgentId,
          operatorWallet: payoutWallet,
        }
      : undefined,
    source: {
      type: 'self_serve',
      externalRef: wallet.toLowerCase(),
    },
    auth: input.auth ?? existing?.auth ?? { type: 'none' },
    verification: existing?.verification ?? { status: 'pending' },
    reputation: existing?.reputation,
    marketplaceOfferStatus:
      input.marketplaceOfferStatus ??
      input.marketplace_offer_status ??
      existing?.marketplaceOfferStatus ??
      'active',
  };
}

export function buildPublicAccountResponse(controlState: ApiControlState, wallet: string) {
  const account = controlState.ensurePublicAccount(wallet);
  const purchases = controlState.listBuyerPurchases(wallet, 20);
  return {
    wallet: account.wallet,
    createdAt: account.createdAt,
    balanceUsd: account.balanceUsd,
    sellerProviderIds: account.sellerProviderIds,
    apiKeys: controlState.listBuyerApiKeys(wallet).map((key) => sanitizeBuyerApiKey(key)),
    recentPurchases: purchases,
    totalSavingsUsd: purchases.reduce((sum, entry) => sum + (entry.savingsUsd ?? 0), 0),
  };
}

export function buildProviderVerificationFromHealth(
  provider: ProviderProfile,
  health: ProviderHealthStatus
): NonNullable<ProviderProfile['verification']> {
  const apiVerified = health.reachable === true && health.ready === true && !health.missing?.length;
  const frameworkVerified =
    provider.agentFramework == null || health.agentFramework === provider.agentFramework;
  const modelProviderVerified =
    provider.modelProvider == null || health.modelProvider === provider.modelProvider;
  const modelVerified = provider.modelId == null || health.model === provider.modelId;
  const verified = apiVerified && frameworkVerified && modelProviderVerified && modelVerified;
  const notes = [
    apiVerified ? 'health_ready' : 'health_not_ready',
    provider.agentFramework && health.agentFramework == null ? 'framework_not_reported' : null,
    provider.modelProvider && health.modelProvider == null ? 'model_provider_not_reported' : null,
    provider.modelId && health.model == null ? 'model_not_reported' : null,
    frameworkVerified ? null : 'framework_mismatch',
    modelProviderVerified ? null : 'model_provider_mismatch',
    modelVerified ? null : 'model_mismatch',
    health.error ? `health_error:${health.error}` : null,
  ].filter((note): note is string => Boolean(note));

  return {
    status: verified ? 'verified' : 'failed',
    checkedAt: new Date().toISOString(),
    apiVerified,
    frameworkVerified,
    modelVerified: modelProviderVerified && modelVerified,
    notes,
  };
}

export function buildProviderVerificationRegistrationInput(
  provider: ProviderProfile,
  verification: NonNullable<ProviderProfile['verification']>
): ProviderRegistrationInput {
  return {
    agentId: provider.agentId ?? provider.providerId,
    name: provider.displayName,
    description: provider.description,
    endpoint: provider.endpoint,
    capabilities: provider.specializations,
    supportedLanguages: provider.supportedLanguages,
    supportedFrameworks: provider.supportedFrameworks,
    outputTypes: provider.outputTypes,
    modelFamily: provider.modelFamily,
    agentFramework: provider.agentFramework,
    modelProvider: provider.modelProvider,
    modelId: provider.modelId,
    maxConcurrency: provider.maxConcurrency,
    source: provider.source,
    privacy: provider.privacy,
    erc8004: provider.erc8004,
    trust: provider.trust,
    pricing: provider.pricing ?? {
      mode: 'task',
      currency: 'USD',
      pricePerTaskUsd: provider.pricePerTaskUsd,
    },
    auth: provider.auth,
    verification,
    reputation: provider.reputation,
  };
}
