import type { Provider, ProviderHealth, RaidAgentLog, RaidResult } from './api';
import { uniqueStrings } from './mercenary-format';
import type { ConversationSpecialistRecord } from './mercenary-specialist-types.js';

export function buildProviderNote(
  provider: Provider | undefined,
  health: ProviderHealth | undefined
): string {
  if (provider?.specializations.length) {
    return provider.specializations.slice(0, 3).join(' / ');
  }

  return provider?.description ?? health?.error ?? health?.endpoint ?? 'Specialization pending.';
}

export function buildProviderProofTags(
  provider: Provider | undefined,
  routingDecision?: NonNullable<RaidResult['routingProof']>['providers'][number]
): string[] {
  const tags: string[] = [];
  const privacyFeatures = new Set<string>(routingDecision?.privacyFeatures ?? []);
  if (provider?.privacy?.teeAttested) {
    privacyFeatures.add('tee_attested');
  }
  if (provider?.privacy?.signedOutputs) {
    privacyFeatures.add('signed_outputs');
  }
  if (
    (routingDecision?.erc8004VerificationStatus ?? provider?.erc8004?.verification?.status) ===
    'verified'
  ) {
    tags.push('8004');
  }
  if (privacyFeatures.has('tee_attested')) {
    tags.push('TEE');
  }
  if (privacyFeatures.has('signed_outputs')) {
    tags.push('signed');
  }
  if (privacyFeatures.has('e2ee')) {
    tags.push('E2EE');
  }
  return uniqueStrings(tags).slice(0, 3);
}

export function buildToolCallTrace(call: RaidAgentLog['toolCalls'][number]): string {
  if (call.tool === 'provider_http_invite') {
    const workstream =
      typeof call.details?.workstream === 'string' ? call.details.workstream : null;
    const role = typeof call.details?.role === 'string' ? call.details.role : null;
    return (
      [workstream, role].filter((value): value is string => Boolean(value)).join(' / ') ||
      'Mercenary opened the assignment.'
    );
  }

  if (call.tool === 'provider_http_accept') {
    return typeof call.details?.providerRunId === 'string'
      ? `Run id ${call.details.providerRunId}.`
      : 'Specialist accepted the assignment.';
  }

  if (call.tool === 'provider_http_run') {
    const latency =
      typeof call.details?.latencyMs === 'number' && Number.isFinite(call.details.latencyMs)
        ? `${Math.round(call.details.latencyMs)}ms`
        : null;
    return latency ? `Specialist started execution. ${latency}.` : 'Specialist started execution.';
  }

  if (call.tool === 'evaluate_submission') {
    return 'Mercenary scored the submitted deliverable.';
  }

  return call.status;
}

export function countTeeAttestedSpecialists(specialists: ConversationSpecialistRecord[]): number {
  return specialists.filter((specialist) => specialist.proofTags.includes('TEE')).length;
}

export function countProofTag(specialists: ConversationSpecialistRecord[], tag: string): number {
  return specialists.filter((specialist) => specialist.proofTags.includes(tag)).length;
}
