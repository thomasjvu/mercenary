import {
  buildErc8004ProofLabel,
  hasErc8004Registration,
  type ProviderErc8004Like,
} from './erc8004.js';
import { shortValue } from './format.js';
import type { Erc8004VerificationStatus } from './types.js';

export type RoutingDecisionLike = {
  providerId?: string;
  phase?: 'primary' | 'reserve';
  workstreamId?: string;
  workstreamLabel?: string;
  roleId?: string;
  roleLabel?: string;
  agentFramework?: string;
  modelProvider?: string;
  modelId?: string;
  verificationStatus?: 'pending' | 'verified' | 'failed' | 'error';
  veniceBacked?: boolean;
  erc8004Registered?: boolean;
  trustScore?: number;
  registrationTx?: string;
  registrationTxFound?: boolean;
  operatorMatchesOwner?: boolean;
  erc8004VerificationStatus?: Erc8004VerificationStatus;
  privacyFeatures?: string[];
  reasons?: string[];
};

export type RoutingProviderLike = ProviderErc8004Like & {
  displayName?: string;
  agentFramework?: string;
  modelProvider?: string;
  modelId?: string;
  modelFamily?: string;
  verification?: {
    status?: 'pending' | 'verified' | 'failed' | 'error';
  };
  privacy?: {
    noDataRetention?: boolean;
    signedOutputs?: boolean;
    teeAttested?: boolean;
  };
  trust?: {
    score?: number;
  };
};

export function matchRoutingDecision(
  decisions: RoutingDecisionLike[] | undefined,
  workstreamLabel?: string,
  roleLabel?: string
): RoutingDecisionLike | undefined {
  if (!decisions?.length) {
    return undefined;
  }

  if (workstreamLabel || roleLabel) {
    const exactMatch = decisions.find(
      (decision) =>
        (workstreamLabel == null || decision.workstreamLabel === workstreamLabel) &&
        (roleLabel == null || decision.roleLabel === roleLabel)
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  return decisions.find((decision) => decision.phase === 'primary') ?? decisions[0];
}

function isVeniceProvider(provider: RoutingProviderLike | undefined): boolean {
  return (provider?.modelFamily ?? '').toLowerCase().includes('venice');
}

export function buildProviderProofNote(
  decision: RoutingDecisionLike | undefined,
  provider: RoutingProviderLike | undefined
): string {
  const privacyFeatures = new Set<string>(decision?.privacyFeatures ?? []);
  if (provider?.privacy?.noDataRetention) {
    privacyFeatures.add('no_data_retention');
  }
  if (provider?.privacy?.signedOutputs) {
    privacyFeatures.add('signed_outputs');
  }
  if (provider?.privacy?.teeAttested) {
    privacyFeatures.add('tee_attested');
  }

  const trustScore =
    decision?.trustScore ??
    (typeof provider?.trust?.score === 'number' ? provider.trust.score : undefined);
  const verificationStatus =
    decision?.erc8004VerificationStatus ?? provider?.erc8004?.verification?.status;
  const registered =
    decision?.erc8004Registered ?? (provider ? hasErc8004Registration(provider) : false);
  const registrationTx = decision?.registrationTx ?? provider?.erc8004?.registrationTx;
  const registrationTxFound =
    decision?.registrationTxFound ?? provider?.erc8004?.verification?.registrationTxFound;
  const operatorMatchesOwner =
    decision?.operatorMatchesOwner ?? provider?.erc8004?.verification?.operatorMatchesOwner;
  const parts = [
    decision?.verificationStatus === 'verified' || provider?.verification?.status === 'verified'
      ? 'agent verified'
      : null,
    (decision?.agentFramework ?? provider?.agentFramework)
      ? `framework ${decision?.agentFramework ?? provider?.agentFramework}`
      : null,
    (decision?.modelProvider ?? provider?.modelProvider)
      ? `model ${[decision?.modelProvider ?? provider?.modelProvider, decision?.modelId ?? provider?.modelId].filter(Boolean).join('/')}`
      : null,
    buildErc8004ProofLabel(verificationStatus, registered),
    registrationTxFound === false ? 'reg tx missing' : null,
    operatorMatchesOwner === false ? 'owner mismatch' : null,
    registrationTx ? `reg ${shortValue(registrationTx)}` : null,
    typeof trustScore === 'number' && trustScore > 0 ? `trust ${trustScore}` : null,
    (decision?.veniceBacked ?? (provider ? isVeniceProvider(provider) : false)) ? 'venice' : null,
    privacyFeatures.has('no_data_retention') ? 'no-retention' : null,
    privacyFeatures.has('signed_outputs') ? 'signed outputs' : null,
    privacyFeatures.has('tee_attested') ? 'tee attested' : null,
  ].filter((value): value is string => value != null);

  return parts.join(' · ');
}

export function buildRoutingReasonNote(decision: RoutingDecisionLike | undefined): string {
  if (!decision?.reasons?.length) {
    return '';
  }

  const reasonLabels = decision.reasons
    .filter(
      (reason) => !['selected_primary', 'reserved_fallback', 'workstream_scoped'].includes(reason)
    )
    .map((reason) => {
      switch (reason) {
        case 'strict_privacy':
          return 'strict privacy';
        case 'privacy_requested':
          return 'privacy preferred';
        case 'venice_private_lane':
          return 'venice lane';
        case 'venice_fallback':
          return 'venice fallback';
        case 'allowed_model_family':
          return 'model family match';
        case 'allowed_agent_framework':
          return 'framework match';
        case 'allowed_model_provider':
          return 'model provider match';
        case 'allowed_model_id':
          return 'model id match';
        case 'round_robin_selected':
          return 'round robin';
        case 'required_privacy_features':
          return 'privacy features';
        case 'erc8004_required':
          return 'erc-8004 required';
        case 'trust_threshold_met':
          return 'trust threshold';
        case 'trust_ranked':
          return 'trust-ranked';
        case 'specialization_match':
          return 'specialist match';
        case 'promoted_from_reserve':
          return 'reserve promotion';
        default:
          return reason.replaceAll('_', ' ');
      }
    });

  return reasonLabels.join(' / ');
}

export function countProvidersMatchingSignal<T extends RoutingDecisionLike>(
  decisions: T[],
  predicate: (decision: T) => boolean
): number {
  let count = 0;
  const grouped = new Map<string, T[]>();

  for (const decision of decisions) {
    const existing = grouped.get(decision.providerId ?? '') ?? [];
    existing.push(decision);
    grouped.set(decision.providerId ?? '', existing);
  }

  for (const providerDecisions of grouped.values()) {
    if (providerDecisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
}

export function countProvidersWithSignal<T extends RoutingDecisionLike>(
  routingDecisionMap: Map<string, T[]>,
  predicate: (decision: T) => boolean
): number {
  let count = 0;

  for (const decisions of routingDecisionMap.values()) {
    if (decisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
}

export function buildRoutingDecisionSummary(decision: RoutingDecisionLike): string {
  const workstream =
    decision.workstreamLabel && decision.roleLabel
      ? `${decision.workstreamLabel} / ${decision.roleLabel}`
      : (decision.workstreamLabel ?? decision.roleLabel ?? 'root raid');
  const privacySignals = [
    buildErc8004ProofLabel(decision.erc8004VerificationStatus, decision.erc8004Registered ?? false),
    decision.registrationTxFound === false ? 'reg tx missing' : null,
    decision.operatorMatchesOwner === false ? 'owner mismatch' : null,
    decision.veniceBacked ? 'venice' : null,
    decision.registrationTx ? `reg ${shortValue(decision.registrationTx)}` : null,
    typeof decision.trustScore === 'number' && decision.trustScore > 0
      ? `trust ${decision.trustScore}`
      : null,
    decision.privacyFeatures?.includes('no_data_retention') ? 'no-retention' : null,
    decision.privacyFeatures?.includes('tee_attested') ? 'tee' : null,
  ].filter((value): value is string => value != null);
  const reasons = (decision.reasons ?? [])
    .filter(
      (reason) => !['selected_primary', 'reserved_fallback', 'workstream_scoped'].includes(reason)
    )
    .map((reason) => reason.replaceAll('_', ' '))
    .join(' / ');

  return [
    `${decision.phase ?? 'primary'} · ${workstream}`,
    privacySignals.join(' · '),
    reasons ? `why ${reasons}` : null,
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(' · ');
}
