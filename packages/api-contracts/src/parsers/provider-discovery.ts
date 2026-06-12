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
      input.capabilities == null
        ? undefined
        : String(input.capabilities)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    allowedModelFamilies:
      input.allowedModelFamilies == null && input.allowed_model_families == null
        ? undefined
        : String(input.allowedModelFamilies ?? input.allowed_model_families)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
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
  };
}
