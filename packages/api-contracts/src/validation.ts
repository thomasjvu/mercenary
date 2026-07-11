import type {
  AgentFramework,
  ChatCompletionMessage,
  Erc8004Verification,
  HostContext,
  MarketplaceOfferStatus,
  OutputType,
  PrivacyFeatureKey,
  PrivacyRoutingMode,
  ProviderAuthConfig,
  ProviderPricingCurrency,
  ProviderPricingMode,
  ProviderStatus,
  ProviderVerificationStatus,
  SelectionMode,
  SupportedLanguage,
} from '@bossraid/shared-types';

export const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>([
  'csharp',
  'typescript',
  'python',
  'solidity',
  'text',
]);
export const OUTPUT_TYPES = new Set<OutputType>([
  'text',
  'json',
  'image',
  'video',
  'patch',
  'bundle',
]);
export const PRIVACY_ROUTING_MODES = new Set<PrivacyRoutingMode>(['off', 'prefer', 'strict']);
export const SELECTION_MODES = new Set<SelectionMode>([
  'best_match',
  'privacy_first',
  'cost_first',
  'diverse_mix',
  'round_robin',
]);
export const AGENT_FRAMEWORKS = new Set<AgentFramework>([
  'codex',
  'claude_code',
  'openclaw',
  'grok',
  'custom',
]);
const PROVIDER_VERIFICATION_STATUSES = new Set<ProviderVerificationStatus>([
  'pending',
  'verified',
  'failed',
  'error',
]);
const ERC8004_VERIFICATION_STATUSES = new Set<Erc8004Verification['status']>([
  'not_checked',
  'verified',
  'partial',
  'failed',
  'error',
]);
export const PRIVACY_FEATURES = new Set<PrivacyFeatureKey>([
  'tee_attested',
  'e2ee',
  'no_data_retention',
  'signed_outputs',
  'provenance_attested',
  'operator_verified',
]);
const HOSTS = new Set<HostContext['host']>(['codex', 'claude_code', 'party-quest']);
const PROVIDER_AUTH_TYPES = new Set<ProviderAuthConfig['type']>(['bearer', 'hmac', 'none']);
const PROVIDER_STATUSES = new Set<ProviderStatus>(['available', 'degraded', 'offline']);
const PROVIDER_PRICING_MODES = new Set<ProviderPricingMode>(['token_metered', 'task']);
const MARKETPLACE_OFFER_STATUSES = new Set<MarketplaceOfferStatus>(['active', 'paused']);
const PROVIDER_PRICING_CURRENCIES = new Set<ProviderPricingCurrency>(['USD', 'USDC']);
const CHAT_MESSAGE_ROLES = new Set<ChatCompletionMessage['role']>(['system', 'user', 'assistant']);

export class ApiContractError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ApiContractError';
    this.statusCode = statusCode;
  }
}

export function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiContractError(`Expected object for ${label}.`);
  }

  return value as Record<string, unknown>;
}

export function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiContractError(`Expected non-empty string for ${label}.`);
  }

  return value;
}

export function ensureOptionalString(value: unknown, label: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  return ensureString(value, label);
}

export function ensureNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiContractError(`Expected finite number for ${label}.`);
  }

  return value;
}

export function ensureFiniteNumberLike(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new ApiContractError(`Expected finite number for ${label}.`);
}

export function ensureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiContractError(`Expected boolean for ${label}.`);
  }

  return value;
}

export function ensureBooleanLike(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }

  throw new ApiContractError(`Expected boolean for ${label}.`);
}

export function ensureStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ApiContractError(`Expected string array for ${label}.`);
  }

  return value;
}

export function ensureOptionalRecord(
  value: unknown,
  label: string
): Record<string, unknown> | undefined {
  if (value == null) {
    return undefined;
  }

  return ensureRecord(value, label);
}

export function ensurePositiveIntegerLike(value: unknown, label: string): number {
  const parsed = ensureFiniteNumberLike(value, label);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiContractError(`Expected positive integer for ${label}.`);
  }

  return parsed;
}

export function ensureLanguage(value: unknown, label: string): SupportedLanguage {
  const normalized = ensureString(value, label) as SupportedLanguage;
  if (!SUPPORTED_LANGUAGES.has(normalized)) {
    throw new ApiContractError(`Unsupported language for ${label}.`);
  }

  return normalized;
}

export function ensureOutputType(value: unknown, label: string): OutputType {
  const normalized = ensureString(value, label) as OutputType;
  if (!OUTPUT_TYPES.has(normalized)) {
    throw new ApiContractError(`Unsupported output type for ${label}.`);
  }

  return normalized;
}

export function ensureOutputTypeArray(value: unknown, label: string): OutputType[] {
  return ensureStringArray(value, label).map((item, index) =>
    ensureOutputType(item, `${label}[${index}]`)
  );
}

export function ensurePrivacyRoutingMode(value: unknown, label: string): PrivacyRoutingMode {
  const normalized = ensureString(value, label) as PrivacyRoutingMode;
  if (!PRIVACY_ROUTING_MODES.has(normalized)) {
    throw new ApiContractError(`Unsupported privacy mode for ${label}.`);
  }

  return normalized;
}

export function ensurePrivacyFeatureArray(value: unknown, label: string): PrivacyFeatureKey[] {
  return ensureStringArray(value, label).map((item, index) =>
    ensurePrivacyFeature(item, `${label}[${index}]`)
  );
}

export function ensurePrivacyFeature(value: unknown, label: string): PrivacyFeatureKey {
  const normalized = ensureString(value, label) as PrivacyFeatureKey;
  if (!PRIVACY_FEATURES.has(normalized)) {
    throw new ApiContractError(`Unsupported privacy feature for ${label}.`);
  }

  return normalized;
}

export function ensureSelectionMode(value: unknown, label: string): SelectionMode {
  const normalized = ensureString(value, label) as SelectionMode;
  if (!SELECTION_MODES.has(normalized)) {
    throw new ApiContractError(`Unsupported selection mode for ${label}.`);
  }

  return normalized;
}

export function ensureAgentFramework(value: unknown, label: string): AgentFramework {
  const normalized = ensureString(value, label) as AgentFramework;
  if (!AGENT_FRAMEWORKS.has(normalized)) {
    throw new ApiContractError(`Unsupported agent framework for ${label}.`);
  }

  return normalized;
}

export function ensureAgentFrameworkArray(value: unknown, label: string): AgentFramework[] {
  return ensureStringArray(value, label).map((item, index) =>
    ensureAgentFramework(item, `${label}[${index}]`)
  );
}

export function ensureProviderVerificationStatus(
  value: unknown,
  label: string
): ProviderVerificationStatus {
  const normalized = ensureString(value, label) as ProviderVerificationStatus;
  if (!PROVIDER_VERIFICATION_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider verification status for ${label}.`);
  }

  return normalized;
}

export function ensureMarketplaceOfferStatus(
  value: unknown,
  label: string
): MarketplaceOfferStatus {
  const normalized = ensureString(value, label) as MarketplaceOfferStatus;
  if (!MARKETPLACE_OFFER_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported marketplace offer status for ${label}.`);
  }
  return normalized;
}

export function ensureProviderPricingMode(value: unknown, label: string): ProviderPricingMode {
  const normalized = ensureString(value, label) as ProviderPricingMode;
  if (!PROVIDER_PRICING_MODES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider pricing mode for ${label}.`);
  }
  return normalized;
}

export function ensureProviderPricingCurrency(
  value: unknown,
  label: string
): ProviderPricingCurrency {
  const normalized = ensureString(value, label).toUpperCase() as ProviderPricingCurrency;
  if (!PROVIDER_PRICING_CURRENCIES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider pricing currency for ${label}.`);
  }
  return normalized;
}

export function ensureTrustSource(value: unknown, label: string): 'erc8004' {
  const normalized = ensureString(value, label);
  if (normalized !== 'erc8004') {
    throw new ApiContractError(`Unsupported trust source for ${label}.`);
  }

  return normalized;
}

export function ensureErc8004VerificationStatus(
  value: unknown,
  label: string
): Erc8004Verification['status'] {
  const normalized = ensureString(value, label) as Erc8004Verification['status'];
  if (!ERC8004_VERIFICATION_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported ERC-8004 verification status for ${label}.`);
  }

  return normalized;
}

export function ensureHost(value: unknown, label: string): HostContext['host'] {
  const normalized = ensureString(value, label) as HostContext['host'];
  if (!HOSTS.has(normalized)) {
    throw new ApiContractError(`Unsupported host for ${label}.`);
  }

  return normalized;
}

export function ensureProviderAuthType(value: unknown, label: string): ProviderAuthConfig['type'] {
  const normalized = ensureString(value, label) as ProviderAuthConfig['type'];
  if (!PROVIDER_AUTH_TYPES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider auth type for ${label}.`);
  }

  return normalized;
}

export function ensureProviderStatus(value: unknown, label: string): ProviderStatus {
  const normalized = ensureString(value, label) as ProviderStatus;
  if (!PROVIDER_STATUSES.has(normalized)) {
    throw new ApiContractError(`Unsupported provider status for ${label}.`);
  }

  return normalized;
}

export function ensureChatMessageRole(
  value: unknown,
  label: string
): ChatCompletionMessage['role'] {
  const normalized = ensureString(value, label) as ChatCompletionMessage['role'];
  if (!CHAT_MESSAGE_ROLES.has(normalized)) {
    throw new ApiContractError(`Unsupported chat message role for ${label}.`);
  }

  return normalized;
}

export function ensureMessageArray(value: unknown, label: string): ChatCompletionMessage[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Expected array for ${label}.`);
  }
  if (value.length === 0) {
    throw new ApiContractError(`Expected non-empty array for ${label}.`);
  }

  return value.map((item, index) => {
    const message = ensureRecord(item, `${label}[${index}]`);
    return {
      role: ensureChatMessageRole(message.role, `${label}[${index}].role`),
      content: ensureString(message.content, `${label}[${index}].content`),
    };
  });
}
