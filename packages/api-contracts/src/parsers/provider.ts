import type {
  AgentHeartbeatInput,
  Erc8004Verification,
  PrivacyAttestation,
  ProviderAuthConfig,
  ProviderDiscoveryQuery,
  ProviderFailure,
  ProviderHeartbeat,
  ProviderRegistrationInput,
  ProviderSubmission,
  ProviderVerification,
} from '@bossraid/shared-types';
import {
  ApiContractError,
  ensureAgentFramework,
  ensureBoolean,
  ensureBooleanLike,
  ensureErc8004VerificationStatus,
  ensureFiniteNumberLike,
  ensureLanguage,
  ensureMarketplaceOfferStatus,
  ensureNumber,
  ensureOptionalRecord,
  ensureOptionalString,
  ensureOutputType,
  ensureOutputTypeArray,
  ensurePrivacyFeature,
  ensurePrivacyFeatureArray,
  ensurePrivacyRoutingMode,
  ensureProviderAuthType,
  ensureProviderPricingCurrency,
  ensureProviderPricingMode,
  ensureProviderStatus,
  ensureProviderVerificationStatus,
  ensureRecord,
  ensureString,
  ensureStringArray,
  ensureTrustSource,
} from '../validation.js';

function parseProviderAuthConfig(value: unknown): ProviderAuthConfig | undefined {
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

function parseErc8004Verification(value: unknown, field: string): Erc8004Verification {
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

function parseProviderVerification(value: unknown, field: string): ProviderVerification {
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

export function parseProviderHeartbeat(value: unknown, providerId: string): ProviderHeartbeat {
  const input = ensureRecord(value, 'provider_heartbeat');
  return {
    raidId: ensureString(input.raidId, 'provider_heartbeat.raidId'),
    providerId,
    providerRunId: ensureString(input.providerRunId, 'provider_heartbeat.providerRunId'),
    progress: ensureNumber(input.progress, 'provider_heartbeat.progress'),
    message: ensureOptionalString(input.message, 'provider_heartbeat.message'),
    timestamp:
      ensureOptionalString(input.timestamp, 'provider_heartbeat.timestamp') ??
      new Date().toISOString(),
  };
}

export function parseProviderSubmission(value: unknown, providerId: string): ProviderSubmission {
  const input = ensureRecord(value, 'provider_submission');
  const patchUnifiedDiff =
    input.patchUnifiedDiff == null && input.patch_unified_diff == null
      ? undefined
      : ensureString(
          input.patchUnifiedDiff ?? input.patch_unified_diff,
          'provider_submission.patchUnifiedDiff'
        );
  const answerText =
    input.answerText == null && input.answer_text == null
      ? undefined
      : ensureString(input.answerText ?? input.answer_text, 'provider_submission.answerText');
  const artifacts =
    input.artifacts == null
      ? undefined
      : parseSubmissionArtifacts(input.artifacts, 'provider_submission.artifacts');

  if (!patchUnifiedDiff && !answerText && (!artifacts || artifacts.length === 0)) {
    throw new ApiContractError(
      'Expected patchUnifiedDiff, answerText, or artifacts for provider_submission.'
    );
  }

  return {
    raidId: ensureString(input.raidId, 'provider_submission.raidId'),
    providerId,
    providerRunId: ensureOptionalString(
      input.providerRunId ?? input.provider_run_id,
      'provider_submission.providerRunId'
    ),
    patchUnifiedDiff,
    answerText,
    artifacts,
    explanation: ensureString(input.explanation, 'provider_submission.explanation'),
    confidence: ensureNumber(input.confidence, 'provider_submission.confidence'),
    claimedRootCause: ensureOptionalString(
      input.claimedRootCause ?? input.claimed_root_cause,
      'provider_submission.claimedRootCause'
    ),
    contributionRole:
      input.contributionRole == null && input.contribution_role == null
        ? undefined
        : parseContributionRole(
            input.contributionRole ?? input.contribution_role,
            'provider_submission.contributionRole'
          ),
    filesTouched:
      input.filesTouched == null && input.files_touched == null
        ? []
        : ensureStringArray(
            input.filesTouched ?? input.files_touched,
            'provider_submission.filesTouched'
          ),
    submittedAt:
      ensureOptionalString(
        input.submittedAt ?? input.submitted_at,
        'provider_submission.submittedAt'
      ) ?? new Date().toISOString(),
    privacyAttestation:
      input.privacyAttestation == null && input.privacy_attestation == null
        ? undefined
        : parsePrivacyAttestation(
            input.privacyAttestation ?? input.privacy_attestation,
            'provider_submission.privacyAttestation'
          ),
  };
}

function parseSubmissionArtifacts(
  value: unknown,
  field: string
): NonNullable<ProviderSubmission['artifacts']> {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Expected array for ${field}.`);
  }

  return value.map((item, index) => {
    const input = ensureRecord(item, `${field}[${index}]`);
    return {
      outputType: ensureOutputType(
        input.outputType ?? input.output_type,
        `${field}[${index}].outputType`
      ),
      label: ensureString(input.label, `${field}[${index}].label`),
      uri: ensureString(input.uri, `${field}[${index}].uri`),
      mimeType: ensureOptionalString(
        input.mimeType ?? input.mime_type,
        `${field}[${index}].mimeType`
      ),
      description: ensureOptionalString(input.description, `${field}[${index}].description`),
      sha256: ensureOptionalString(input.sha256, `${field}[${index}].sha256`),
    };
  });
}

function parseContributionRole(
  value: unknown,
  field: string
): NonNullable<ProviderSubmission['contributionRole']> {
  const input = ensureRecord(value, field);

  return {
    id: ensureString(input.id, `${field}.id`),
    label: ensureString(input.label, `${field}.label`),
    objective: ensureOptionalString(input.objective, `${field}.objective`),
    workstreamId: ensureOptionalString(
      input.workstreamId ?? input.workstream_id,
      `${field}.workstreamId`
    ),
    workstreamLabel: ensureOptionalString(
      input.workstreamLabel ?? input.workstream_label,
      `${field}.workstreamLabel`
    ),
    workstreamObjective: ensureOptionalString(
      input.workstreamObjective ?? input.workstream_objective,
      `${field}.workstreamObjective`
    ),
  };
}

function parsePrivacyAttestation(value: unknown, field: string): PrivacyAttestation {
  const input = ensureRecord(value, field);
  const teeInput = ensureOptionalRecord(
    input.teeAttestation ?? input.tee_attestation,
    `${field}.teeAttestation`
  );

  return {
    providerId: ensureString(input.providerId ?? input.provider_id, `${field}.providerId`),
    raidId: ensureString(input.raidId ?? input.raid_id, `${field}.raidId`),
    submittedAt: ensureString(input.submittedAt ?? input.submitted_at, `${field}.submittedAt`),
    featuresClaimed: ensurePrivacyFeatureArray(
      input.featuresClaimed ?? input.features_claimed,
      `${field}.featuresClaimed`
    ),
    featuresVerified: ensurePrivacyFeatureArray(
      input.featuresVerified ?? input.features_verified,
      `${field}.featuresVerified`
    ),
    teeAttestation: teeInput
      ? {
          valid: ensureBoolean(teeInput.valid, `${field}.teeAttestation.valid`),
          providerId: ensureString(
            teeInput.providerId ?? teeInput.provider_id,
            `${field}.teeAttestation.providerId`
          ),
          verifiedAt: ensureString(
            teeInput.verifiedAt ?? teeInput.verified_at,
            `${field}.teeAttestation.verifiedAt`
          ),
          expiresAt: ensureOptionalString(
            teeInput.expiresAt ?? teeInput.expires_at,
            `${field}.teeAttestation.expiresAt`
          ),
          vendor: ensureString(teeInput.vendor, `${field}.teeAttestation.vendor`),
          enclaveHash: ensureOptionalString(
            teeInput.enclaveHash ?? teeInput.enclave_hash,
            `${field}.teeAttestation.enclaveHash`
          ),
          signature: ensureOptionalString(teeInput.signature, `${field}.teeAttestation.signature`),
          runtimeMode: ensureOptionalString(
            teeInput.runtimeMode ?? teeInput.runtime_mode,
            `${field}.teeAttestation.runtimeMode`
          ),
          notes:
            teeInput.notes == null
              ? undefined
              : ensureStringArray(teeInput.notes, `${field}.teeAttestation.notes`),
        }
      : undefined,
    externalApiCalls:
      input.externalApiCalls == null && input.external_api_calls == null
        ? []
        : ensureStringArray(
            input.externalApiCalls ?? input.external_api_calls,
            `${field}.externalApiCalls`
          ),
    dataRetained: ensureBoolean(input.dataRetained ?? input.data_retained, `${field}.dataRetained`),
    signedDeclaration: ensureString(
      input.signedDeclaration ?? input.signed_declaration,
      `${field}.signedDeclaration`
    ),
  };
}

export function parseProviderFailure(value: unknown, providerId: string): ProviderFailure {
  const input = ensureRecord(value, 'provider_failure');
  return {
    raidId: ensureString(input.raidId, 'provider_failure.raidId'),
    providerId,
    providerRunId: ensureOptionalString(input.providerRunId, 'provider_failure.providerRunId'),
    message: ensureString(input.message, 'provider_failure.message'),
    failedAt:
      ensureOptionalString(input.failedAt, 'provider_failure.failedAt') ?? new Date().toISOString(),
  };
}

export function parseProviderRegistrationInput(value: unknown): ProviderRegistrationInput {
  const input = ensureRecord(value, 'provider_registration');
  const pricing =
    input.pricing == null
      ? undefined
      : ensureRecord(input.pricing, 'provider_registration.pricing');
  const reputation =
    input.reputation == null
      ? undefined
      : ensureRecord(input.reputation, 'provider_registration.reputation');
  const erc8004 =
    input.erc8004 == null
      ? undefined
      : ensureRecord(input.erc8004, 'provider_registration.erc8004');
  const trust =
    input.trust == null ? undefined : ensureRecord(input.trust, 'provider_registration.trust');
  const verification =
    input.verification == null
      ? undefined
      : parseProviderVerification(input.verification, 'provider_registration.verification');

  return {
    agentId: ensureString(input.agentId ?? input.agent_id, 'provider_registration.agent_id'),
    name: ensureString(input.name, 'provider_registration.name'),
    description: ensureOptionalString(input.description, 'provider_registration.description'),
    endpoint: ensureString(input.endpoint, 'provider_registration.endpoint'),
    capabilities:
      input.capabilities == null
        ? undefined
        : ensureStringArray(input.capabilities, 'provider_registration.capabilities'),
    supportedLanguages:
      input.supportedLanguages == null && input.supported_languages == null
        ? undefined
        : ensureStringArray(
            input.supportedLanguages ?? input.supported_languages,
            'provider_registration.supported_languages'
          ).map((item, index) =>
            ensureLanguage(item, `provider_registration.supported_languages[${index}]`)
          ),
    supportedFrameworks:
      input.supportedFrameworks == null && input.supported_frameworks == null
        ? undefined
        : ensureStringArray(
            input.supportedFrameworks ?? input.supported_frameworks,
            'provider_registration.supported_frameworks'
          ),
    outputTypes:
      input.outputTypes == null && input.output_types == null
        ? undefined
        : ensureOutputTypeArray(
            input.outputTypes ?? input.output_types,
            'provider_registration.output_types'
          ),
    modelFamily: ensureOptionalString(
      input.modelFamily ?? input.model_family,
      'provider_registration.model_family'
    ),
    agentFramework:
      input.agentFramework == null && input.agent_framework == null
        ? undefined
        : ensureAgentFramework(
            input.agentFramework ?? input.agent_framework,
            'provider_registration.agent_framework'
          ),
    modelProvider: ensureOptionalString(
      input.modelProvider ?? input.model_provider,
      'provider_registration.model_provider'
    ),
    modelId: ensureOptionalString(
      input.modelId ?? input.model_id,
      'provider_registration.model_id'
    ),
    maxConcurrency:
      input.maxConcurrency == null && input.max_concurrency == null
        ? undefined
        : ensureNumber(
            input.maxConcurrency ?? input.max_concurrency,
            'provider_registration.max_concurrency'
          ),
    source:
      input.source == null
        ? undefined
        : (() => {
            const source = ensureRecord(input.source, 'provider_registration.source');
            return {
              type: ensureString(source.type, 'provider_registration.source.type'),
              targetType: ensureOptionalString(
                source.targetType ?? source.target_type,
                'provider_registration.source.target_type'
              ),
              externalRef: ensureOptionalString(
                source.externalRef ?? source.external_ref,
                'provider_registration.source.external_ref'
              ),
              displayIcon: ensureOptionalString(
                source.displayIcon ?? source.display_icon,
                'provider_registration.source.display_icon'
              ),
              memberCount:
                source.memberCount == null && source.member_count == null
                  ? undefined
                  : ensureNumber(
                      source.memberCount ?? source.member_count,
                      'provider_registration.source.member_count'
                    ),
            };
          })(),
    privacy:
      input.privacy == null
        ? undefined
        : {
            score:
              typeof ensureRecord(input.privacy, 'provider_registration.privacy').score === 'number'
                ? (ensureRecord(input.privacy, 'provider_registration.privacy').score as number)
                : undefined,
            teeAttested:
              ensureRecord(input.privacy, 'provider_registration.privacy').teeAttested === true ||
              ensureRecord(input.privacy, 'provider_registration.privacy').tee_attested === true,
            teeVendor: ensureOptionalString(
              ensureRecord(input.privacy, 'provider_registration.privacy').teeVendor ??
                ensureRecord(input.privacy, 'provider_registration.privacy').tee_vendor,
              'provider_registration.privacy.tee_vendor'
            ),
            e2ee: ensureRecord(input.privacy, 'provider_registration.privacy').e2ee === true,
            noDataRetention:
              ensureRecord(input.privacy, 'provider_registration.privacy').noDataRetention ===
                true ||
              ensureRecord(input.privacy, 'provider_registration.privacy').no_data_retention ===
                true,
            signedOutputs:
              ensureRecord(input.privacy, 'provider_registration.privacy').signedOutputs === true ||
              ensureRecord(input.privacy, 'provider_registration.privacy').signed_outputs === true,
            provenanceAttested:
              ensureRecord(input.privacy, 'provider_registration.privacy').provenanceAttested ===
                true ||
              ensureRecord(input.privacy, 'provider_registration.privacy').provenance_attested ===
                true,
            operatorVerified:
              ensureRecord(input.privacy, 'provider_registration.privacy').operatorVerified ===
                true ||
              ensureRecord(input.privacy, 'provider_registration.privacy').operator_verified ===
                true,
          },
    erc8004:
      erc8004 == null
        ? undefined
        : {
            agentId: ensureString(
              erc8004.agentId ?? erc8004.agent_id,
              'provider_registration.erc8004.agent_id'
            ),
            operatorWallet: ensureOptionalString(
              erc8004.operatorWallet ?? erc8004.operator_wallet,
              'provider_registration.erc8004.operator_wallet'
            ),
            registrationTx: ensureOptionalString(
              erc8004.registrationTx ?? erc8004.registration_tx,
              'provider_registration.erc8004.registration_tx'
            ),
            identityRegistry: ensureOptionalString(
              erc8004.identityRegistry ?? erc8004.identity_registry,
              'provider_registration.erc8004.identity_registry'
            ),
            reputationRegistry: ensureOptionalString(
              erc8004.reputationRegistry ?? erc8004.reputation_registry,
              'provider_registration.erc8004.reputation_registry'
            ),
            validationRegistry: ensureOptionalString(
              erc8004.validationRegistry ?? erc8004.validation_registry,
              'provider_registration.erc8004.validation_registry'
            ),
            validationTxs:
              erc8004.validationTxs == null && erc8004.validation_txs == null
                ? undefined
                : ensureStringArray(
                    erc8004.validationTxs ?? erc8004.validation_txs,
                    'provider_registration.erc8004.validation_txs'
                  ),
            lastVerifiedAt: ensureOptionalString(
              erc8004.lastVerifiedAt ?? erc8004.last_verified_at,
              'provider_registration.erc8004.last_verified_at'
            ),
            verification:
              erc8004.verification == null
                ? undefined
                : parseErc8004Verification(
                    erc8004.verification,
                    'provider_registration.erc8004.verification'
                  ),
          },
    trust:
      trust == null
        ? undefined
        : {
            score:
              trust.score == null
                ? undefined
                : ensureNumber(trust.score, 'provider_registration.trust.score'),
            reason: ensureOptionalString(trust.reason, 'provider_registration.trust.reason'),
            source:
              trust.source == null
                ? undefined
                : ensureTrustSource(trust.source, 'provider_registration.trust.source'),
          },
    pricing: pricing
      ? {
          mode:
            pricing.mode == null
              ? undefined
              : ensureProviderPricingMode(pricing.mode, 'pricing.mode'),
          pricePerTaskUsd:
            pricing.pricePerTaskUsd == null && pricing.price_per_task_usd == null
              ? undefined
              : ensureFiniteNumberLike(
                  pricing.pricePerTaskUsd ?? pricing.price_per_task_usd,
                  'pricing.price_per_task_usd'
                ),
          pricePer1mInputTokensUsd:
            pricing.pricePer1mInputTokensUsd == null &&
            pricing.price_per_1m_input_tokens_usd == null
              ? undefined
              : ensureFiniteNumberLike(
                  pricing.pricePer1mInputTokensUsd ?? pricing.price_per_1m_input_tokens_usd,
                  'pricing.price_per_1m_input_tokens_usd'
                ),
          pricePer1mOutputTokensUsd:
            pricing.pricePer1mOutputTokensUsd == null &&
            pricing.price_per_1m_output_tokens_usd == null
              ? undefined
              : ensureFiniteNumberLike(
                  pricing.pricePer1mOutputTokensUsd ?? pricing.price_per_1m_output_tokens_usd,
                  'pricing.price_per_1m_output_tokens_usd'
                ),
          minimumChargeUsd:
            pricing.minimumChargeUsd == null && pricing.minimum_charge_usd == null
              ? undefined
              : ensureFiniteNumberLike(
                  pricing.minimumChargeUsd ?? pricing.minimum_charge_usd,
                  'pricing.minimum_charge_usd'
                ),
          currency:
            pricing.currency == null
              ? undefined
              : ensureProviderPricingCurrency(pricing.currency, 'pricing.currency'),
          validFrom: ensureOptionalString(
            pricing.validFrom ?? pricing.valid_from,
            'pricing.valid_from'
          ),
          validUntil: ensureOptionalString(
            pricing.validUntil ?? pricing.valid_until,
            'pricing.valid_until'
          ),
          rateCardVersion: ensureOptionalString(
            pricing.rateCardVersion ?? pricing.rate_card_version,
            'pricing.rate_card_version'
          ),
          rateCardHash: ensureOptionalString(
            pricing.rateCardHash ?? pricing.rate_card_hash,
            'pricing.rate_card_hash'
          ),
          upstreamModelId: ensureOptionalString(
            pricing.upstreamModelId ?? pricing.upstream_model_id,
            'pricing.upstream_model_id'
          ),
          maxContextTokens:
            pricing.maxContextTokens == null && pricing.max_context_tokens == null
              ? undefined
              : ensureFiniteNumberLike(
                  pricing.maxContextTokens ?? pricing.max_context_tokens,
                  'pricing.max_context_tokens'
                ),
        }
      : undefined,
    auth: parseProviderAuthConfig(input.auth),
    verification,
    reputation: reputation
      ? {
          globalScore:
            reputation.globalScore == null
              ? undefined
              : ensureNumber(reputation.globalScore, 'reputation.globalScore'),
          responsivenessScore:
            reputation.responsivenessScore == null
              ? undefined
              : ensureNumber(reputation.responsivenessScore, 'reputation.responsivenessScore'),
          validityScore:
            reputation.validityScore == null
              ? undefined
              : ensureNumber(reputation.validityScore, 'reputation.validityScore'),
          qualityScore:
            reputation.qualityScore == null
              ? undefined
              : ensureNumber(reputation.qualityScore, 'reputation.qualityScore'),
          timeoutRate:
            reputation.timeoutRate == null
              ? undefined
              : ensureNumber(reputation.timeoutRate, 'reputation.timeoutRate'),
          duplicateRate:
            reputation.duplicateRate == null
              ? undefined
              : ensureNumber(reputation.duplicateRate, 'reputation.duplicateRate'),
          specializationScores:
            reputation.specializationScores == null
              ? undefined
              : (ensureRecord(
                  reputation.specializationScores,
                  'reputation.specializationScores'
                ) as Record<string, number>),
          p50LatencyMs:
            reputation.p50LatencyMs == null
              ? undefined
              : ensureNumber(reputation.p50LatencyMs, 'reputation.p50LatencyMs'),
          p95LatencyMs:
            reputation.p95LatencyMs == null
              ? undefined
              : ensureNumber(reputation.p95LatencyMs, 'reputation.p95LatencyMs'),
          totalRaids:
            reputation.totalRaids == null
              ? undefined
              : ensureNumber(reputation.totalRaids, 'reputation.totalRaids'),
          totalSuccessfulRaids:
            reputation.totalSuccessfulRaids == null
              ? undefined
              : ensureNumber(reputation.totalSuccessfulRaids, 'reputation.totalSuccessfulRaids'),
        }
      : undefined,
    marketplaceOfferStatus:
      input.marketplaceOfferStatus == null && input.marketplace_offer_status == null
        ? undefined
        : ensureMarketplaceOfferStatus(
            input.marketplaceOfferStatus ?? input.marketplace_offer_status,
            'provider_registration.marketplace_offer_status'
          ),
  };
}

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

function splitCommaSeparatedStrings(value: unknown): string[] {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
