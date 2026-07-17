import type { HarnessRuntimeConfig } from './profile.js';

export type ImageAllowlistResult =
  | { ok: true; digest?: string; mode: 'not_required' | 'allowlisted' | 'empty_allowlist_dev' }
  | { ok: false; reason: string; digest?: string };

/**
 * Parse BOSSRAID_HARNESS_IMAGE_ALLOWLIST (comma-separated digests).
 * Digests may be full sha256:… or bare hex.
 */
export function parseHarnessImageAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.BOSSRAID_HARNESS_IMAGE_ALLOWLIST?.trim() ?? '';
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((part) => normalizeImageDigest(part))
      .filter(Boolean)
  );
}

export function normalizeImageDigest(value: string | undefined): string {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('sha256:')) {
    return trimmed;
  }
  if (/^[a-f0-9]{64}$/.test(trimmed)) {
    return `sha256:${trimmed}`;
  }
  return trimmed;
}

/**
 * Specialized agents (skills / skill_augmented) must pin an allowlisted image when
 * BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST=1 or NODE_ENV=production.
 * Vanilla fresh seats may omit digest.
 */
export function assertHarnessImageAllowed(
  config: Pick<HarnessRuntimeConfig, 'installation' | 'skills' | 'imageDigest' | 'kind'>,
  env: NodeJS.ProcessEnv = process.env
): ImageAllowlistResult {
  const specialized = config.installation === 'skill_augmented' || (config.skills?.length ?? 0) > 0;
  const digest = normalizeImageDigest(config.imageDigest);
  const allowlist = parseHarnessImageAllowlist(env);
  const requireAllowlist =
    env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST === '1' ||
    env.BOSSRAID_HARNESS_REQUIRE_IMAGE_ALLOWLIST === 'true' ||
    env.NODE_ENV === 'production';

  if (!specialized) {
    if (digest && allowlist.size > 0 && !allowlist.has(digest)) {
      return {
        ok: false,
        reason: `Vanilla harness imageDigest ${digest} is not on BOSSRAID_HARNESS_IMAGE_ALLOWLIST.`,
        digest,
      };
    }
    return {
      ok: true,
      digest: digest || undefined,
      mode: digest ? 'allowlisted' : 'not_required',
    };
  }

  if (!digest) {
    return {
      ok: false,
      reason:
        'Specialized harness seats require imageDigest so the skill pack is pinned to a known docker image.',
      digest: undefined,
    };
  }

  if (allowlist.size === 0) {
    if (requireAllowlist) {
      return {
        ok: false,
        reason:
          'Specialized harness requires BOSSRAID_HARNESS_IMAGE_ALLOWLIST with the pinned imageDigest in production.',
        digest,
      };
    }
    return { ok: true, digest, mode: 'empty_allowlist_dev' };
  }

  if (!allowlist.has(digest)) {
    return {
      ok: false,
      reason: `Specialized harness imageDigest ${digest} is not on BOSSRAID_HARNESS_IMAGE_ALLOWLIST.`,
      digest,
    };
  }

  return { ok: true, digest, mode: 'allowlisted' };
}
