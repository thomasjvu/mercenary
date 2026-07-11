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

export function forceDiscountInferenceChatPolicy(
  chatRequest: ChatCompletionRequest,
  options: {
    defaultMaxTotalCost?: number;
    strictAlkahestLane?: boolean;
  } = {}
): ChatCompletionRequest {
  const policy = (chatRequest.raidPolicy ?? {}) as Record<string, unknown>;
  const existingAllowedModelIds = readPolicyStringArray(
    policy.allowedModelIds ?? policy.allowed_model_ids
  );
  const existingAllowedOutputTypes = readPolicyStringArray(
    policy.allowedOutputTypes ?? policy.allowed_output_types
  );
  const maxTotalCost = policy.maxTotalCost ?? policy.max_total_cost ?? options.defaultMaxTotalCost;
  const privacyMode = options.strictAlkahestLane
    ? 'strict'
    : (readPrivacyMode(policy.privacyMode) ?? readPrivacyMode(policy.privacy_mode) ?? 'prefer');
  const requiredPrivacyFeatures = options.strictAlkahestLane
    ? [...STRICT_PRIVATE_PRIVACY_FEATURES]
    : undefined;

  return {
    ...chatRequest,
    raidPolicy: {
      ...chatRequest.raidPolicy,
      maxAgents: 1,
      maxTotalCost: maxTotalCost as number | string | undefined,
      allowedModelIds:
        existingAllowedModelIds && existingAllowedModelIds.length > 0
          ? existingAllowedModelIds
          : [chatRequest.model],
      allowedOutputTypes:
        existingAllowedOutputTypes && existingAllowedOutputTypes.length > 0
          ? (existingAllowedOutputTypes as NonNullable<
              ChatCompletionRequest['raidPolicy']
            >['allowedOutputTypes'])
          : ['text', 'json'],
      privacyMode,
      requirePrivacyFeatures:
        requiredPrivacyFeatures ?? chatRequest.raidPolicy?.requirePrivacyFeatures,
      requireErc8004: options.strictAlkahestLane ? true : chatRequest.raidPolicy?.requireErc8004,
      minTrustScore: options.strictAlkahestLane
        ? Math.max(Number(policy.minTrustScore ?? policy.min_trust_score ?? 0), 80)
        : chatRequest.raidPolicy?.minTrustScore,
      requiredVerificationStatus: options.strictAlkahestLane
        ? 'verified'
        : chatRequest.raidPolicy?.requiredVerificationStatus,
      allowedModelProviders: options.strictAlkahestLane
        ? ['google']
        : chatRequest.raidPolicy?.allowedModelProviders,
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
