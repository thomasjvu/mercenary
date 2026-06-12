import type { ProviderRegistrationInput } from '@bossraid/shared-types';
import {
  ensureAgentFramework,
  ensureFiniteNumberLike,
  ensureLanguage,
  ensureMarketplaceOfferStatus,
  ensureNumber,
  ensureOptionalString,
  ensureOutputTypeArray,
  ensureProviderPricingCurrency,
  ensureProviderPricingMode,
  ensureRecord,
  ensureString,
  ensureStringArray,
  ensureTrustSource,
} from '../validation.js';
import {
  parseErc8004Verification,
  parseProviderAuthConfig,
  parseProviderVerification,
} from './provider-shared.js';

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
