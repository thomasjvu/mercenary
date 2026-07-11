import { createHash } from 'node:crypto';
import type {
  AgentFramework,
  HarnessInstallation,
  HarnessProfile,
  HarnessSkillRef,
} from '@bossraid/shared-types';

export type HarnessKind = 'off' | 'codex' | 'grok';

export type HarnessRuntimeConfig = {
  kind: HarnessKind;
  installation: HarnessInstallation;
  skills: HarnessSkillRef[];
  imageDigest?: string;
  modelId?: string;
  modelApiBase?: string;
  planProvider?: string;
  maxSteps: number;
  allowShell: boolean;
};

export function normalizeHarnessKind(value: string | undefined): HarnessKind {
  if (!value || value === 'off' || value === '0' || value === 'false') {
    return 'off';
  }
  if (value === 'codex' || value === 'grok') {
    return value;
  }
  if (value === '1' || value === 'true' || value === 'agent' || value === 'agent_harness') {
    return 'codex';
  }
  throw new Error('BOSSRAID_HARNESS_MODE must be off, codex, or grok (or true for codex default).');
}

export function parseHarnessSkills(raw: string | undefined): HarnessSkillRef[] {
  if (!raw?.trim()) {
    return [];
  }
  // Comma-separated skill ids, optional id@version
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

export function resolveInstallation(skills: HarnessSkillRef[]): HarnessInstallation {
  return skills.length > 0 ? 'skill_augmented' : 'fresh';
}

export function frameworkForHarness(kind: HarnessKind): AgentFramework | undefined {
  if (kind === 'codex') {
    return 'codex';
  }
  if (kind === 'grok') {
    return 'grok';
  }
  return undefined;
}

export function planProviderForHarness(kind: HarnessKind): string | undefined {
  if (kind === 'codex') {
    return 'openai';
  }
  if (kind === 'grok') {
    return 'xai';
  }
  return undefined;
}

export function computeCompositionHash(input: {
  kind: HarnessKind;
  installation: HarnessInstallation;
  skills: HarnessSkillRef[];
  imageDigest?: string;
  modelId?: string;
  modelApiBase?: string;
}): string {
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
    modelHost: safeHost(input.modelApiBase),
  });
  return createHash('sha256').update(payload).digest('hex');
}

function safeHost(apiBase: string | undefined): string | null {
  if (!apiBase) {
    return null;
  }
  try {
    return new URL(apiBase).host;
  } catch {
    return apiBase;
  }
}

export function buildHarnessProfile(config: HarnessRuntimeConfig): HarnessProfile | undefined {
  if (config.kind === 'off') {
    return undefined;
  }

  const compositionHash = computeCompositionHash(config);
  return {
    lane: 'agent_harness',
    installation: config.installation,
    skills: config.skills,
    imageDigest: config.imageDigest,
    compositionHash,
    framework: frameworkForHarness(config.kind),
    planProvider: config.planProvider ?? planProviderForHarness(config.kind),
    attestedAt: new Date().toISOString(),
    verification: config.imageDigest ? 'image_attested' : 'heartbeat_self_report',
  };
}
