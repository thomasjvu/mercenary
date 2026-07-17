import { createHash } from 'node:crypto';
import type { HarnessInstallation, HarnessProfile, HarnessSkillRef } from '@bossraid/shared-types';

/**
 * Inputs used to bind a harness profile into a stable composition hash.
 * Kept independent of agent runtime so offline verifiers can recompute.
 */
export type HarnessCompositionInput = {
  kind: string;
  installation: HarnessInstallation;
  skills: HarnessSkillRef[];
  imageDigest?: string;
  modelId?: string;
  modelApiBase?: string;
};

export function parseHarnessSkills(raw: string | undefined): HarnessSkillRef[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, version] = entry.split('@');
      return {
        id: id!.trim(),
        version: version?.trim() || undefined,
        contentHash: createHash('sha256').update(entry).digest('hex').slice(0, 16),
      };
    });
}

export function resolveHarnessInstallation(skills: HarnessSkillRef[]): HarnessInstallation {
  return skills.length > 0 ? 'skill_augmented' : 'fresh';
}

export function harnessModelHost(apiBase: string | undefined): string | null {
  if (!apiBase) {
    return null;
  }
  try {
    return new URL(apiBase).host;
  } catch {
    return apiBase;
  }
}

export function computeHarnessCompositionHash(input: HarnessCompositionInput): string {
  const payload = JSON.stringify({
    kind: input.kind,
    installation: input.installation,
    skills: input.skills
      .map((skill) => ({
        id: skill.id,
        version: skill.version ?? null,
        contentHash: skill.contentHash ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    imageDigest: input.imageDigest ?? null,
    modelId: input.modelId ?? null,
    modelHost: harnessModelHost(input.modelApiBase),
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Recompute composition hash from a published profile when possible.
 * Uses framework as kind fallback when kind is not stored on the profile.
 */
export function recomputeHarnessCompositionHash(
  profile: Pick<
    HarnessProfile,
    'installation' | 'skills' | 'imageDigest' | 'framework' | 'planProvider'
  > & {
    kind?: string;
    modelId?: string;
    modelApiBase?: string;
  }
): string {
  return computeHarnessCompositionHash({
    kind: profile.kind ?? String(profile.framework ?? profile.planProvider ?? 'unknown'),
    installation: profile.installation,
    skills: profile.skills ?? [],
    imageDigest: profile.imageDigest,
    modelId: profile.modelId,
    modelApiBase: profile.modelApiBase,
  });
}

export function harnessFreshClaimIsConsistent(
  profile: Pick<HarnessProfile, 'installation' | 'skills'>
): boolean {
  if (profile.installation !== 'fresh') {
    return true;
  }
  return (profile.skills?.length ?? 0) === 0;
}

export type HarnessIntegrityIssue = {
  code: string;
  message: string;
};

/**
 * Fail-closed honesty checks for agent harness profiles.
 * Used when marking providers verified / routing "verified agent" seats.
 */
export function evaluateHarnessProfileIntegrity(
  profile: Pick<
    HarnessProfile,
    | 'lane'
    | 'installation'
    | 'skills'
    | 'imageDigest'
    | 'compositionHash'
    | 'framework'
    | 'planProvider'
    | 'verification'
  > & {
    kind?: string;
    modelId?: string;
    modelApiBase?: string;
  },
  options: {
    /** When true, agent_harness must pin imageDigest to reach integrity ok for specialized seats */
    requireImageDigestForSkills?: boolean;
    /** When true, agent_harness always requires imageDigest for integrity ok */
    requireImageDigest?: boolean;
  } = {}
): { ok: boolean; issues: HarnessIntegrityIssue[] } {
  const issues: HarnessIntegrityIssue[] = [];
  if (profile.lane !== 'agent_harness') {
    return { ok: true, issues };
  }

  if (!harnessFreshClaimIsConsistent(profile)) {
    issues.push({
      code: 'fresh_skills_mismatch',
      message: 'installation=fresh cannot declare skills.',
    });
  }

  if (profile.installation === 'skill_augmented' && (profile.skills?.length ?? 0) === 0) {
    issues.push({
      code: 'skill_augmented_empty',
      message: 'installation=skill_augmented requires at least one skill.',
    });
  }

  const skillsNeedDigest =
    options.requireImageDigest === true ||
    (options.requireImageDigestForSkills !== false &&
      (profile.installation === 'skill_augmented' || (profile.skills?.length ?? 0) > 0));
  if (skillsNeedDigest && !profile.imageDigest?.trim()) {
    issues.push({
      code: 'image_digest_required',
      message:
        'Specialized agent harness seats require imageDigest so buyers can pin a known docker image.',
    });
  }

  // Optional allowlist (ops-controlled digests only for specialized seats).
  if (profile.imageDigest?.trim() && typeof process !== 'undefined' && process.env) {
    const allowlistRaw = process.env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST?.trim() ?? '';
    if (allowlistRaw) {
      const allowed = new Set(
        allowlistRaw
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean)
          .map((part) => (part.startsWith('sha256:') ? part : `sha256:${part}`))
      );
      const digest = profile.imageDigest.trim().toLowerCase();
      const normalized = digest.startsWith('sha256:') ? digest : `sha256:${digest}`;
      if (!allowed.has(normalized) && !allowed.has(digest)) {
        issues.push({
          code: 'image_digest_not_allowlisted',
          message: `imageDigest ${profile.imageDigest} is not on BOSSRAID_HARNESS_IMAGE_ALLOWLIST.`,
        });
      }
    }
  }

  if (profile.compositionHash?.trim()) {
    const recomputed = recomputeHarnessCompositionHash(profile);
    // Profile may have been hashed without modelApiBase; accept either host null or provided base.
    const recomputedNullHost = recomputeHarnessCompositionHash({
      ...profile,
      modelApiBase: undefined,
    });
    if (recomputed !== profile.compositionHash && recomputedNullHost !== profile.compositionHash) {
      issues.push({
        code: 'composition_hash_mismatch',
        message: 'Published compositionHash does not match recomputed harness composition.',
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** True when harness can claim verified agent marketplace status. */
export function harnessProfileQualifiesAsVerifiedAgent(
  profile: Pick<
    HarnessProfile,
    | 'lane'
    | 'installation'
    | 'skills'
    | 'imageDigest'
    | 'compositionHash'
    | 'framework'
    | 'planProvider'
    | 'verification'
  >
): boolean {
  if (profile.lane !== 'agent_harness') {
    return false;
  }
  const integrity = evaluateHarnessProfileIntegrity(profile, {
    requireImageDigestForSkills: true,
  });
  if (!integrity.ok) {
    return false;
  }
  // Vanilla (fresh, no skills) may use platform image without digest in dev;
  // specialized always needs digest. Prefer image_attested when digest present.
  if ((profile.skills?.length ?? 0) > 0 || profile.installation === 'skill_augmented') {
    return Boolean(profile.imageDigest?.trim()) && integrity.ok;
  }
  return integrity.ok;
}
