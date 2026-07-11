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
