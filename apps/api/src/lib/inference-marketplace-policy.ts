import { estimateBenchmarkTaskUsd } from '@bossraid/constants';
import { asSingleHeader, type ChatCompletionRequest } from '@bossraid/shared-types';
import { safeEqualString } from './http.js';

/** Strict private marketplace / Alkahest lane required privacy feature set. */
export const STRICT_PRIVATE_PRIVACY_FEATURES = [
  'tee_attested',
  'e2ee',
  'signed_outputs',
  'no_data_retention',
] as const satisfies NonNullable<ChatCompletionRequest['raidPolicy']>['requirePrivacyFeatures'];

export function readPolicyStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return undefined;
}

function readPrivacyMode(
  value: unknown
): NonNullable<ChatCompletionRequest['raidPolicy']>['privacyMode'] {
  return value === 'off' || value === 'prefer' || value === 'strict' ? value : undefined;
}

/**
 * Map top-level OpenAI-friendly fields onto raid_policy for discount inference.
 * - provider: "auto" | upstream id → allowedModelProviders
 * - max_price_usd / max_price_ratio → maxTotalCost
 */
export function applyDiscountInferenceBuyerErgonomics(
  chatRequest: ChatCompletionRequest
): ChatCompletionRequest {
  const policy = { ...(chatRequest.raidPolicy ?? {}) } as Record<string, unknown>;

  const providerRaw = chatRequest.provider?.trim().toLowerCase();
  if (providerRaw && providerRaw !== 'auto' && providerRaw !== 'any') {
    const existing = readPolicyStringArray(
      policy.allowedModelProviders ?? policy.allowed_model_providers
    );
    if (!existing || existing.length === 0) {
      policy.allowedModelProviders = [providerRaw];
    }
  }

  let maxTotalCost = policy.maxTotalCost ?? policy.max_total_cost;
  if (chatRequest.max_price_usd != null && Number.isFinite(chatRequest.max_price_usd)) {
    maxTotalCost = chatRequest.max_price_usd;
  }
  if (chatRequest.max_price_ratio != null && Number.isFinite(chatRequest.max_price_ratio)) {
    const ratio = Math.min(1, Math.max(0, chatRequest.max_price_ratio));
    const benchmark = estimateBenchmarkTaskUsd(chatRequest.model) ?? 0.01;
    const ratioCap = Math.max(0.01, Number((benchmark * ratio).toFixed(6)));
    const prior =
      maxTotalCost == null || maxTotalCost === ''
        ? undefined
        : Number(maxTotalCost as number | string);
    maxTotalCost = prior != null && Number.isFinite(prior) ? Math.min(prior, ratioCap) : ratioCap;
  }
  if (maxTotalCost != null) {
    policy.maxTotalCost = maxTotalCost;
  }

  return {
    ...chatRequest,
    raidPolicy: policy as ChatCompletionRequest['raidPolicy'],
  };
}

export function forceDiscountInferenceChatPolicy(
  chatRequest: ChatCompletionRequest,
  options: {
    defaultMaxTotalCost?: number;
    strictAlkahestLane?: boolean;
  } = {}
): ChatCompletionRequest {
  const ergonomic = applyDiscountInferenceBuyerErgonomics(chatRequest);
  const policy = (ergonomic.raidPolicy ?? {}) as Record<string, unknown>;
  const existingAllowedModelIds = readPolicyStringArray(
    policy.allowedModelIds ?? policy.allowed_model_ids
  );
  const existingAllowedOutputTypes = readPolicyStringArray(
    policy.allowedOutputTypes ?? policy.allowed_output_types
  );
  const existingAllowedProviders = readPolicyStringArray(
    policy.allowedModelProviders ?? policy.allowed_model_providers
  );
  const maxTotalCost = policy.maxTotalCost ?? policy.max_total_cost ?? options.defaultMaxTotalCost;
  const privacyMode = options.strictAlkahestLane
    ? 'strict'
    : (readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode) ?? 'prefer');
  const requiredPrivacyFeatures = options.strictAlkahestLane
    ? [...STRICT_PRIVATE_PRIVACY_FEATURES]
    : undefined;

  return {
    ...ergonomic,
    raidPolicy: {
      ...ergonomic.raidPolicy,
      maxAgents: 1,
      maxTotalCost: maxTotalCost as number | string | undefined,
      allowedModelIds:
        existingAllowedModelIds && existingAllowedModelIds.length > 0
          ? existingAllowedModelIds
          : [ergonomic.model],
      allowedOutputTypes:
        existingAllowedOutputTypes && existingAllowedOutputTypes.length > 0
          ? (existingAllowedOutputTypes as NonNullable<
              ChatCompletionRequest['raidPolicy']
            >['allowedOutputTypes'])
          : ['text', 'json'],
      privacyMode,
      requirePrivacyFeatures:
        requiredPrivacyFeatures ?? ergonomic.raidPolicy?.requirePrivacyFeatures,
      requireErc8004: options.strictAlkahestLane ? true : ergonomic.raidPolicy?.requireErc8004,
      minTrustScore: options.strictAlkahestLane
        ? Math.max(Number(policy.minTrustScore ?? policy.min_trust_score ?? 0), 80)
        : ergonomic.raidPolicy?.minTrustScore,
      requiredVerificationStatus: options.strictAlkahestLane
        ? 'verified'
        : ergonomic.raidPolicy?.requiredVerificationStatus,
      allowedModelProviders: options.strictAlkahestLane
        ? ['google']
        : existingAllowedProviders && existingAllowedProviders.length > 0
          ? existingAllowedProviders
          : ergonomic.raidPolicy?.allowedModelProviders,
      selectionMode: 'cost_first',
    },
  };
}

export function readTrustedAlkahestClient(
  headers: Record<string, string | string[] | undefined>,
  options: {
    trustedKey?: string;
  } = {}
): { sourceAppId: 'alkahest' } | undefined {
  const clientId = asSingleHeader(headers['x-bossraid-client-id']);
  const sourceAppId = asSingleHeader(headers['x-bossraid-source-app-id']);
  if (clientId !== 'alkahest' && sourceAppId !== 'alkahest') {
    return undefined;
  }

  const trustedKey = options.trustedKey?.trim();
  if (!trustedKey) {
    return undefined;
  }
  if (!safeEqualString(asSingleHeader(headers.authorization), `Bearer ${trustedKey}`)) {
    return undefined;
  }

  return { sourceAppId: 'alkahest' };
}
