import type {
  Erc8004Verification,
  ProviderAuthConfig,
  ProviderVerification,
} from '@bossraid/shared-types';
import {
  ensureBooleanLike,
  ensureErc8004VerificationStatus,
  ensureOptionalString,
  ensureProviderAuthType,
  ensureProviderVerificationStatus,
  ensureRecord,
  ensureString,
  ensureStringArray,
} from '../validation.js';

export function parseProviderAuthConfig(value: unknown): ProviderAuthConfig | undefined {
  if (value == null) {
    return undefined;
  }

  const input = ensureRecord(value, 'provider_auth');
  return {
    type: ensureProviderAuthType(input.type, 'provider_auth.type'),
    token: ensureOptionalString(input.token, 'provider_auth.token'),
    secret: ensureOptionalString(input.secret, 'provider_auth.secret'),
    headerName: ensureOptionalString(
      input.headerName ?? input.header_name,
      'provider_auth.header_name'
    ),
  };
}

export function parseErc8004Verification(value: unknown, field: string): Erc8004Verification {
  const input = ensureRecord(value, field);

  return {
    status: ensureErc8004VerificationStatus(input.status, `${field}.status`),
    checkedAt: ensureString(input.checkedAt ?? input.checked_at, `${field}.checked_at`),
    chainId: ensureOptionalString(input.chainId ?? input.chain_id, `${field}.chain_id`),
    agentRegistry: ensureOptionalString(
      input.agentRegistry ?? input.agent_registry,
      `${field}.agent_registry`
    ),
    owner: ensureOptionalString(input.owner, `${field}.owner`),
    agentUri: ensureOptionalString(input.agentUri ?? input.agent_uri, `${field}.agent_uri`),
    registrationTxFound:
      input.registrationTxFound == null && input.registration_tx_found == null
        ? undefined
        : ensureBooleanLike(
            input.registrationTxFound ?? input.registration_tx_found,
            `${field}.registration_tx_found`
          ),
    operatorMatchesOwner:
      input.operatorMatchesOwner == null && input.operator_matches_owner == null
        ? undefined
        : ensureBooleanLike(
            input.operatorMatchesOwner ?? input.operator_matches_owner,
            `${field}.operator_matches_owner`
          ),
    identityRegistryReachable:
      input.identityRegistryReachable == null && input.identity_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.identityRegistryReachable ?? input.identity_registry_reachable,
            `${field}.identity_registry_reachable`
          ),
    reputationRegistryReachable:
      input.reputationRegistryReachable == null && input.reputation_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.reputationRegistryReachable ?? input.reputation_registry_reachable,
            `${field}.reputation_registry_reachable`
          ),
    validationRegistryReachable:
      input.validationRegistryReachable == null && input.validation_registry_reachable == null
        ? undefined
        : ensureBooleanLike(
            input.validationRegistryReachable ?? input.validation_registry_reachable,
            `${field}.validation_registry_reachable`
          ),
    notes: input.notes == null ? undefined : ensureStringArray(input.notes, `${field}.notes`),
  };
}

export function parseProviderVerification(value: unknown, field: string): ProviderVerification {
  const input = ensureRecord(value, field);

  return {
    status: ensureProviderVerificationStatus(input.status, `${field}.status`),
    checkedAt: ensureOptionalString(input.checkedAt ?? input.checked_at, `${field}.checked_at`),
    apiVerified:
      input.apiVerified == null && input.api_verified == null
        ? undefined
        : ensureBooleanLike(input.apiVerified ?? input.api_verified, `${field}.api_verified`),
    frameworkVerified:
      input.frameworkVerified == null && input.framework_verified == null
        ? undefined
        : ensureBooleanLike(
            input.frameworkVerified ?? input.framework_verified,
            `${field}.framework_verified`
          ),
    modelVerified:
      input.modelVerified == null && input.model_verified == null
        ? undefined
        : ensureBooleanLike(input.modelVerified ?? input.model_verified, `${field}.model_verified`),
    notes: input.notes == null ? undefined : ensureStringArray(input.notes, `${field}.notes`),
  };
}

export function splitCommaSeparatedStrings(value: unknown): string[] {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
