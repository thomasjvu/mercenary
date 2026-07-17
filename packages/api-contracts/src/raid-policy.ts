import type { BossRaidRequest, RaidConstraints } from '@bossraid/shared-types';
import {
  ApiContractError,
  ensureAgentFrameworkArray,
  ensureBooleanLike,
  ensureFiniteNumberLike,
  ensureNumber,
  ensureOptionalRecord,
  ensureOutputTypeArray,
  ensurePositiveIntegerLike,
  ensurePrivacyFeatureArray,
  ensurePrivacyRoutingMode,
  ensureProviderVerificationStatus,
  ensureSelectionMode,
  ensureStringArray,
} from './validation.js';

export function readRaidPolicyField(
  record: Record<string, unknown> | undefined,
  camelKey: string,
  snakeKey: string
): unknown {
  if (record == null) {
    return undefined;
  }

  return record[camelKey] ?? record[snakeKey];
}

function readRaidPolicyFieldFromSources(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown> | undefined,
  camelKey: string,
  snakeKey: string
): unknown {
  const fromPrimary = readRaidPolicyField(primary, camelKey, snakeKey);
  if (fromPrimary !== undefined) {
    return fromPrimary;
  }

  return readRaidPolicyField(secondary, camelKey, snakeKey);
}

export interface RaidPolicyFields {
  maxAgents: unknown;
  maxTotalCost: unknown;
  maxLatencySec: unknown;
  requiredCapabilities: unknown;
  minReputationScore: unknown;
  requireErc8004: unknown;
  minTrustScore: unknown;
  requiredVerificationStatus: unknown;
  maxInputTokens: unknown;
  maxOutputTokens: unknown;
  allowedModelFamilies: unknown;
  allowedAgentFrameworks: unknown;
  requiredProviderIds: unknown;
  allowedModelProviders: unknown;
  allowedModelIds: unknown;
  allowedOutputTypes: unknown;
  privacyMode: unknown;
  requirePrivacyFeatures: unknown;
  selectionMode: unknown;
  allowedInstallations: unknown;
  requiredSkills: unknown;
  allowedCredentialClasses: unknown;
}

export interface RaidConstraintsFields {
  requireErc8004: unknown;
  minTrustScore: unknown;
  requiredVerificationStatus: unknown;
  maxInputTokens: unknown;
  maxOutputTokens: unknown;
  maxChangedFiles: unknown;
  maxDiffLines: unknown;
  forbidPaths: unknown;
  allowedModelFamilies: unknown;
  allowedAgentFrameworks: unknown;
  requiredProviderIds: unknown;
  allowedModelProviders: unknown;
  allowedModelIds: unknown;
  allowedOutputTypes: unknown;
  privacyMode: unknown;
  requirePrivacyFeatures: unknown;
  selectionMode: unknown;
  allowedInstallations: unknown;
  requiredSkills: unknown;
  allowedCredentialClasses: unknown;
}

export interface RaidConstraintsOverrides {
  numExperts: number;
  maxBudgetUsd: number;
  maxLatencySec: number;
  allowExternalSearch: boolean;
  requireSpecializations: string[];
  minReputation: number;
}

export interface RaidConstraintsFieldLabels {
  requireErc8004: string;
  minTrustScore: string;
  requiredVerificationStatus: string;
  maxInputTokens: string;
  maxOutputTokens: string;
  maxChangedFiles: string;
  maxDiffLines: string;
  forbidPaths: string;
  allowedModelFamilies: string;
  allowedAgentFrameworks: string;
  requiredProviderIds: string;
  allowedModelProviders: string;
  allowedModelIds: string;
  allowedOutputTypes: string;
  privacyMode: string;
  requirePrivacyFeatures: string;
  selectionMode: string;
  allowedInstallations: string;
  requiredSkills: string;
  allowedCredentialClasses: string;
}

export function raidConstraintsFieldLabels(
  prefix: 'constraints' | 'raid_policy'
): RaidConstraintsFieldLabels {
  return {
    requireErc8004: `${prefix}.require_erc8004`,
    minTrustScore: `${prefix}.min_trust_score`,
    requiredVerificationStatus: `${prefix}.required_verification_status`,
    maxInputTokens: `${prefix}.max_input_tokens`,
    maxOutputTokens: `${prefix}.max_output_tokens`,
    maxChangedFiles: `${prefix}.max_changed_files`,
    maxDiffLines: `${prefix}.max_diff_lines`,
    forbidPaths: `${prefix}.forbid_paths`,
    allowedModelFamilies: `${prefix}.allowed_model_families`,
    allowedAgentFrameworks: `${prefix}.allowed_agent_frameworks`,
    requiredProviderIds: `${prefix}.required_provider_ids`,
    allowedModelProviders: `${prefix}.allowed_model_providers`,
    allowedModelIds: `${prefix}.allowed_model_ids`,
    allowedOutputTypes: `${prefix}.allowed_output_types`,
    privacyMode: `${prefix}.privacy_mode`,
    requirePrivacyFeatures: `${prefix}.require_privacy_features`,
    selectionMode: `${prefix}.selection_mode`,
    allowedInstallations: `${prefix}.allowed_installations`,
    requiredSkills: `${prefix}.required_skills`,
    allowedCredentialClasses: `${prefix}.allowed_credential_classes`,
  };
}

export function readRaidConstraintsFields(source: Record<string, unknown>): RaidConstraintsFields {
  const read = (camelKey: string, snakeKey: string) =>
    readRaidPolicyField(source, camelKey, snakeKey);

  return {
    requireErc8004: read('requireErc8004', 'require_erc8004'),
    minTrustScore: read('minTrustScore', 'min_trust_score'),
    requiredVerificationStatus: read('requiredVerificationStatus', 'required_verification_status'),
    maxInputTokens: read('maxInputTokens', 'max_input_tokens'),
    maxOutputTokens: read('maxOutputTokens', 'max_output_tokens'),
    maxChangedFiles: read('maxChangedFiles', 'max_changed_files'),
    maxDiffLines: read('maxDiffLines', 'max_diff_lines'),
    forbidPaths: read('forbidPaths', 'forbid_paths'),
    allowedModelFamilies: read('allowedModelFamilies', 'allowed_model_families'),
    allowedAgentFrameworks: read('allowedAgentFrameworks', 'allowed_agent_frameworks'),
    requiredProviderIds: read('requiredProviderIds', 'required_provider_ids'),
    allowedModelProviders: read('allowedModelProviders', 'allowed_model_providers'),
    allowedModelIds: read('allowedModelIds', 'allowed_model_ids'),
    allowedOutputTypes: read('allowedOutputTypes', 'allowed_output_types'),
    privacyMode: read('privacyMode', 'privacy_mode'),
    requirePrivacyFeatures: read('requirePrivacyFeatures', 'require_privacy_features'),
    selectionMode: read('selectionMode', 'selection_mode'),
    allowedInstallations: read('allowedInstallations', 'allowed_installations'),
    requiredSkills: read('requiredSkills', 'required_skills'),
    allowedCredentialClasses: read('allowedCredentialClasses', 'allowed_credential_classes'),
  };
}

export function raidPolicyFieldsToConstraintFields(
  fields: RaidPolicyFields
): RaidConstraintsFields {
  return {
    requireErc8004: fields.requireErc8004,
    minTrustScore: fields.minTrustScore,
    requiredVerificationStatus: fields.requiredVerificationStatus,
    maxInputTokens: fields.maxInputTokens,
    maxOutputTokens: fields.maxOutputTokens,
    maxChangedFiles: undefined,
    maxDiffLines: undefined,
    forbidPaths: undefined,
    allowedModelFamilies: fields.allowedModelFamilies,
    allowedAgentFrameworks: fields.allowedAgentFrameworks,
    requiredProviderIds: fields.requiredProviderIds,
    allowedModelProviders: fields.allowedModelProviders,
    allowedModelIds: fields.allowedModelIds,
    allowedOutputTypes: fields.allowedOutputTypes,
    privacyMode: fields.privacyMode,
    requirePrivacyFeatures: fields.requirePrivacyFeatures,
    selectionMode: fields.selectionMode,
    allowedInstallations: fields.allowedInstallations,
    requiredSkills: fields.requiredSkills,
    allowedCredentialClasses: fields.allowedCredentialClasses,
  };
}

export function buildRaidConstraintsFromFields(
  fields: RaidConstraintsFields,
  overrides: RaidConstraintsOverrides,
  labels: RaidConstraintsFieldLabels,
  options?: {
    coerceNumericOptionalFields?: boolean;
  }
): RaidConstraints {
  const ensureOptionalNumber = options?.coerceNumericOptionalFields
    ? ensureFiniteNumberLike
    : ensureNumber;

  return {
    ...overrides,
    requireErc8004:
      fields.requireErc8004 == null
        ? undefined
        : ensureBooleanLike(fields.requireErc8004, labels.requireErc8004),
    minTrustScore:
      fields.minTrustScore == null
        ? undefined
        : ensureOptionalNumber(fields.minTrustScore, labels.minTrustScore),
    requiredVerificationStatus:
      fields.requiredVerificationStatus == null
        ? undefined
        : ensureProviderVerificationStatus(
            fields.requiredVerificationStatus,
            labels.requiredVerificationStatus
          ),
    maxInputTokens:
      fields.maxInputTokens == null
        ? undefined
        : ensureOptionalNumber(fields.maxInputTokens, labels.maxInputTokens),
    maxOutputTokens:
      fields.maxOutputTokens == null
        ? undefined
        : ensureOptionalNumber(fields.maxOutputTokens, labels.maxOutputTokens),
    maxChangedFiles:
      fields.maxChangedFiles == null
        ? undefined
        : ensureOptionalNumber(fields.maxChangedFiles, labels.maxChangedFiles),
    maxDiffLines:
      fields.maxDiffLines == null
        ? undefined
        : ensureOptionalNumber(fields.maxDiffLines, labels.maxDiffLines),
    forbidPaths:
      fields.forbidPaths == null
        ? undefined
        : ensureStringArray(fields.forbidPaths, labels.forbidPaths),
    allowedModelFamilies:
      fields.allowedModelFamilies == null
        ? undefined
        : ensureStringArray(fields.allowedModelFamilies, labels.allowedModelFamilies),
    allowedAgentFrameworks:
      fields.allowedAgentFrameworks == null
        ? undefined
        : ensureAgentFrameworkArray(fields.allowedAgentFrameworks, labels.allowedAgentFrameworks),
    requiredProviderIds:
      fields.requiredProviderIds == null
        ? undefined
        : ensureStringArray(fields.requiredProviderIds, labels.requiredProviderIds),
    allowedModelProviders:
      fields.allowedModelProviders == null
        ? undefined
        : ensureStringArray(fields.allowedModelProviders, labels.allowedModelProviders),
    allowedModelIds:
      fields.allowedModelIds == null
        ? undefined
        : ensureStringArray(fields.allowedModelIds, labels.allowedModelIds),
    allowedOutputTypes:
      fields.allowedOutputTypes == null
        ? undefined
        : ensureOutputTypeArray(fields.allowedOutputTypes, labels.allowedOutputTypes),
    privacyMode:
      fields.privacyMode == null
        ? undefined
        : ensurePrivacyRoutingMode(fields.privacyMode, labels.privacyMode),
    requirePrivacyFeatures:
      fields.requirePrivacyFeatures == null
        ? undefined
        : ensurePrivacyFeatureArray(fields.requirePrivacyFeatures, labels.requirePrivacyFeatures),
    selectionMode:
      fields.selectionMode == null
        ? undefined
        : ensureSelectionMode(fields.selectionMode, labels.selectionMode),
    allowedInstallations:
      fields.allowedInstallations == null
        ? undefined
        : ensureHarnessInstallationArray(fields.allowedInstallations, labels.allowedInstallations),
    requiredSkills:
      fields.requiredSkills == null
        ? undefined
        : ensureStringArray(fields.requiredSkills, labels.requiredSkills),
    allowedCredentialClasses:
      fields.allowedCredentialClasses == null
        ? undefined
        : ensureCredentialClassArray(
            fields.allowedCredentialClasses,
            labels.allowedCredentialClasses
          ),
  };
}

function ensureCredentialClassArray(
  value: unknown,
  label: string
): Array<'api_key' | 'plan_or_cli' | 'unknown'> {
  const items = ensureStringArray(value, label);
  return items.map((item, index) => {
    if (item === 'api_key' || item === 'plan_or_cli' || item === 'unknown') {
      return item;
    }
    throw new Error(`${label}[${index}] must be api_key, plan_or_cli, or unknown`);
  });
}

function ensureHarnessInstallationArray(
  value: unknown,
  label: string
): Array<'fresh' | 'skill_augmented' | 'unknown'> {
  const items = ensureStringArray(value, label);
  return items.map((item) => {
    if (item === 'fresh' || item === 'skill_augmented' || item === 'unknown') {
      return item;
    }
    throw new ApiContractError(
      `Expected harness installation values (fresh|skill_augmented|unknown) for ${label}.`
    );
  });
}

export function readRaidPolicyFields(source: Record<string, unknown>): RaidPolicyFields {
  const nestedPolicy =
    source.raidPolicy != null || source.raid_policy != null
      ? (source.raidPolicy ?? source.raid_policy)
      : undefined;
  const nested = nestedPolicy == null ? undefined : (nestedPolicy as Record<string, unknown>);

  const read = (camelKey: string, snakeKey: string) =>
    readRaidPolicyFieldFromSources(source, nested, camelKey, snakeKey);

  return {
    maxAgents: read('maxAgents', 'max_agents'),
    maxTotalCost: read('maxTotalCost', 'max_total_cost'),
    maxLatencySec: read('maxLatencySec', 'max_latency_sec'),
    requiredCapabilities: read('requiredCapabilities', 'required_capabilities'),
    minReputationScore: read('minReputationScore', 'min_reputation_score'),
    requireErc8004: read('requireErc8004', 'require_erc8004'),
    minTrustScore: read('minTrustScore', 'min_trust_score'),
    requiredVerificationStatus: read('requiredVerificationStatus', 'required_verification_status'),
    maxInputTokens: read('maxInputTokens', 'max_input_tokens'),
    maxOutputTokens: read('maxOutputTokens', 'max_output_tokens'),
    allowedModelFamilies: read('allowedModelFamilies', 'allowed_model_families'),
    allowedAgentFrameworks: read('allowedAgentFrameworks', 'allowed_agent_frameworks'),
    requiredProviderIds: read('requiredProviderIds', 'required_provider_ids'),
    allowedModelProviders: read('allowedModelProviders', 'allowed_model_providers'),
    allowedModelIds: read('allowedModelIds', 'allowed_model_ids'),
    allowedOutputTypes: read('allowedOutputTypes', 'allowed_output_types'),
    privacyMode: read('privacyMode', 'privacy_mode'),
    requirePrivacyFeatures: read('requirePrivacyFeatures', 'require_privacy_features'),
    selectionMode: read('selectionMode', 'selection_mode'),
    allowedInstallations: read('allowedInstallations', 'allowed_installations'),
    requiredSkills: read('requiredSkills', 'required_skills'),
    allowedCredentialClasses: read('allowedCredentialClasses', 'allowed_credential_classes'),
  };
}

export function constraintsFromRaidPolicy(raidPolicy: Record<string, unknown>): RaidConstraints {
  const fields = readRaidPolicyFields(raidPolicy);
  const maxTotalCost = ensureFiniteNumberLike(fields.maxTotalCost, 'raid_policy.max_total_cost');

  return buildRaidConstraintsFromFields(
    raidPolicyFieldsToConstraintFields(fields),
    {
      numExperts:
        typeof raidPolicy.maxAgents === 'number'
          ? raidPolicy.maxAgents
          : typeof raidPolicy.max_agents === 'number'
            ? (raidPolicy.max_agents as number)
            : 3,
      maxBudgetUsd: maxTotalCost,
      maxLatencySec:
        fields.maxLatencySec == null
          ? 60
          : ensureFiniteNumberLike(fields.maxLatencySec, 'raid_policy.max_latency_sec'),
      allowExternalSearch: false,
      requireSpecializations:
        fields.requiredCapabilities == null
          ? []
          : ensureStringArray(fields.requiredCapabilities, 'raid_policy.required_capabilities'),
      minReputation:
        typeof raidPolicy.minReputationScore === 'number'
          ? raidPolicy.minReputationScore / 100
          : typeof raidPolicy.min_reputation_score === 'number'
            ? (raidPolicy.min_reputation_score as number) / 100
            : 0,
    },
    raidConstraintsFieldLabels('raid_policy'),
    {
      coerceNumericOptionalFields: true,
    }
  );
}

export function buildNormalizedDelegateRaidPolicy(
  args: Record<string, unknown>
): BossRaidRequest['raidPolicy'] | undefined {
  ensureOptionalRecord(args.raidPolicy ?? args.raid_policy, 'raid_policy');
  const fields = readRaidPolicyFields(args);
  const maxTotalCost = ensureFiniteNumberLike(fields.maxTotalCost, 'raidPolicy.maxTotalCost');

  const result = {
    maxAgents:
      fields.maxAgents == null
        ? undefined
        : ensurePositiveIntegerLike(fields.maxAgents, 'raidPolicy.maxAgents'),
    maxTotalCost,
    requiredCapabilities:
      fields.requiredCapabilities == null
        ? undefined
        : ensureStringArray(fields.requiredCapabilities, 'raidPolicy.requiredCapabilities'),
    minReputationScore:
      fields.minReputationScore == null
        ? undefined
        : ensureFiniteNumberLike(fields.minReputationScore, 'raidPolicy.minReputationScore'),
    requireErc8004:
      fields.requireErc8004 == null
        ? undefined
        : ensureBooleanLike(fields.requireErc8004, 'raidPolicy.requireErc8004'),
    minTrustScore:
      fields.minTrustScore == null
        ? undefined
        : ensureFiniteNumberLike(fields.minTrustScore, 'raidPolicy.minTrustScore'),
    requiredVerificationStatus:
      fields.requiredVerificationStatus == null
        ? undefined
        : ensureProviderVerificationStatus(
            fields.requiredVerificationStatus,
            'raidPolicy.requiredVerificationStatus'
          ),
    maxInputTokens:
      fields.maxInputTokens == null
        ? undefined
        : ensurePositiveIntegerLike(fields.maxInputTokens, 'raidPolicy.maxInputTokens'),
    maxOutputTokens:
      fields.maxOutputTokens == null
        ? undefined
        : ensurePositiveIntegerLike(fields.maxOutputTokens, 'raidPolicy.maxOutputTokens'),
    allowedModelFamilies:
      fields.allowedModelFamilies == null
        ? undefined
        : ensureStringArray(fields.allowedModelFamilies, 'raidPolicy.allowedModelFamilies'),
    allowedAgentFrameworks:
      fields.allowedAgentFrameworks == null
        ? undefined
        : ensureAgentFrameworkArray(
            fields.allowedAgentFrameworks,
            'raidPolicy.allowedAgentFrameworks'
          ),
    requiredProviderIds:
      fields.requiredProviderIds == null
        ? undefined
        : ensureStringArray(fields.requiredProviderIds, 'raidPolicy.requiredProviderIds'),
    allowedModelProviders:
      fields.allowedModelProviders == null
        ? undefined
        : ensureStringArray(fields.allowedModelProviders, 'raidPolicy.allowedModelProviders'),
    allowedModelIds:
      fields.allowedModelIds == null
        ? undefined
        : ensureStringArray(fields.allowedModelIds, 'raidPolicy.allowedModelIds'),
    allowedOutputTypes:
      fields.allowedOutputTypes == null
        ? undefined
        : ensureOutputTypeArray(fields.allowedOutputTypes, 'raidPolicy.allowedOutputTypes'),
    privacyMode:
      fields.privacyMode == null
        ? undefined
        : ensurePrivacyRoutingMode(fields.privacyMode, 'raidPolicy.privacyMode'),
    requirePrivacyFeatures:
      fields.requirePrivacyFeatures == null
        ? undefined
        : ensurePrivacyFeatureArray(
            fields.requirePrivacyFeatures,
            'raidPolicy.requirePrivacyFeatures'
          ),
    selectionMode:
      fields.selectionMode == null
        ? undefined
        : ensureSelectionMode(fields.selectionMode, 'raidPolicy.selectionMode'),
  };

  return Object.values(result).some((item) => item !== undefined) ? result : undefined;
}
