import type { AgentHeartbeatInput, ProviderDiscoveryQuery } from '@bossraid/shared-types';
import {
  ensureAgentFramework,
  ensureBooleanLike,
  ensureNumber,
  ensureOptionalString,
  ensureOutputType,
  ensurePrivacyFeature,
  ensurePrivacyRoutingMode,
  ensureProviderStatus,
  ensureRecord,
  ensureString,
} from '../validation.js';
import { splitCommaSeparatedStrings } from './provider-shared.js';

export function parseAgentHeartbeatInput(value: unknown): AgentHeartbeatInput {
  const input = ensureRecord(value, 'agent_heartbeat');
  return {
    agentId: ensureString(input.agentId ?? input.agent_id, 'agent_heartbeat.agent_id'),
    status:
      input.status == null
        ? undefined
        : ensureProviderStatus(input.status, 'agent_heartbeat.status'),
    timestamp:
      ensureOptionalString(input.timestamp, 'agent_heartbeat.timestamp') ??
      new Date().toISOString(),
  };
}

export function parseProviderDiscoveryQuery(value: unknown): ProviderDiscoveryQuery {
  if (value == null) {
    return {};
  }

  const input = ensureRecord(value, 'provider_discovery_query');
  return {
    capabilities:
      input.capabilities == null ? undefined : splitCommaSeparatedStrings(input.capabilities),
    allowedModelFamilies:
      input.allowedModelFamilies == null && input.allowed_model_families == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedModelFamilies ?? input.allowed_model_families),
    allowedAgentFrameworks:
      input.allowedAgentFrameworks == null && input.allowed_agent_frameworks == null
        ? undefined
        : splitCommaSeparatedStrings(
            input.allowedAgentFrameworks ?? input.allowed_agent_frameworks
          ).map((item, index) =>
            ensureAgentFramework(
              item,
              `provider_discovery_query.allowed_agent_frameworks[${index}]`
            )
          ),
    allowedModelProviders:
      input.allowedModelProviders == null && input.allowed_model_providers == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedModelProviders ?? input.allowed_model_providers),
    allowedModelIds:
      input.allowedModelIds == null && input.allowed_model_ids == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedModelIds ?? input.allowed_model_ids),
    allowedOutputTypes:
      input.allowedOutputTypes == null && input.allowed_output_types == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedOutputTypes ?? input.allowed_output_types).map(
            (item, index) =>
              ensureOutputType(item, `provider_discovery_query.allowed_output_types[${index}]`)
          ),
    privacyMode:
      input.privacyMode == null && input.privacy_mode == null
        ? undefined
        : ensurePrivacyRoutingMode(
            input.privacyMode ?? input.privacy_mode,
            'provider_discovery_query.privacy_mode'
          ),
    requirePrivacyFeatures:
      input.requirePrivacyFeatures == null && input.require_privacy_features == null
        ? undefined
        : splitCommaSeparatedStrings(
            input.requirePrivacyFeatures ?? input.require_privacy_features
          ).map((item, index) =>
            ensurePrivacyFeature(
              item,
              `provider_discovery_query.require_privacy_features[${index}]`
            )
          ),
    allowedInstallations:
      input.allowedInstallations == null && input.allowed_installations == null
        ? undefined
        : splitCommaSeparatedStrings(input.allowedInstallations ?? input.allowed_installations).map(
            (item, index) => {
              if (item === 'fresh' || item === 'skill_augmented' || item === 'unknown') {
                return item;
              }
              throw new Error(
                `provider_discovery_query.allowed_installations[${index}] must be fresh, skill_augmented, or unknown`
              );
            }
          ),
    requiredSkills:
      input.requiredSkills == null && input.required_skills == null
        ? undefined
        : splitCommaSeparatedStrings(input.requiredSkills ?? input.required_skills),
    allowedCredentialClasses:
      input.allowedCredentialClasses == null && input.allowed_credential_classes == null
        ? undefined
        : splitCommaSeparatedStrings(
            input.allowedCredentialClasses ?? input.allowed_credential_classes
          ).map((item, index) => {
            if (item === 'api_key' || item === 'plan_or_cli' || item === 'unknown') {
              return item;
            }
            throw new Error(
              `provider_discovery_query.allowed_credential_classes[${index}] must be api_key, plan_or_cli, or unknown`
            );
          }),
    requireErc8004:
      input.requireErc8004 == null && input.require_erc8004 == null
        ? undefined
        : ensureBooleanLike(
            input.requireErc8004 ?? input.require_erc8004,
            'provider_discovery_query.require_erc8004'
          ),
    minTrustScore:
      input.minTrustScore == null && input.min_trust_score == null
        ? undefined
        : ensureNumber(
            Number(input.minTrustScore ?? input.min_trust_score),
            'provider_discovery_query.min_trust_score'
          ),
    minReputationScore:
      input.minReputationScore == null && input.min_reputation_score == null
        ? undefined
        : ensureNumber(
            Number(input.minReputationScore ?? input.min_reputation_score),
            'provider_discovery_query.min_reputation_score'
          ),
    onlineOnly:
      input.onlineOnly == null && input.online_only == null
        ? undefined
        : ensureBooleanLike(
            input.onlineOnly ?? input.online_only,
            'provider_discovery_query.online_only'
          ),
    maxHeartbeatAgeMs:
      input.maxHeartbeatAgeMs == null && input.max_heartbeat_age_ms == null
        ? undefined
        : ensureNumber(
            Number(input.maxHeartbeatAgeMs ?? input.max_heartbeat_age_ms),
            'provider_discovery_query.max_heartbeat_age_ms'
          ),
    sourceType:
      input.sourceType == null && input.source_type == null
        ? undefined
        : ensureOptionalString(
            input.sourceType ?? input.source_type,
            'provider_discovery_query.source_type'
          ),
    supportedFramework:
      input.supportedFramework == null && input.supported_framework == null
        ? undefined
        : ensureOptionalString(
            input.supportedFramework ?? input.supported_framework,
            'provider_discovery_query.supported_framework'
          ),
  };
}
