import {
  computeHarnessCompositionHash,
  parseHarnessSkills,
  resolveHarnessInstallation,
} from '@bossraid/privacy-engine';
import type {
  AgentFramework,
  HarnessInstallation,
  HarnessProfile,
  HarnessSkillRef,
} from '@bossraid/shared-types';

export type HarnessKind = 'off' | 'codex' | 'grok' | 'glm';

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
  if (value === 'codex' || value === 'grok' || value === 'glm' || value === 'zai') {
    return value === 'zai' ? 'glm' : value;
  }
  if (value === '1' || value === 'true' || value === 'agent' || value === 'agent_harness') {
    return 'codex';
  }
  throw new Error(
    'BOSSRAID_HARNESS_MODE must be off, codex, grok, or glm (or true for codex default).'
  );
}

export { parseHarnessSkills };

export function resolveInstallation(skills: HarnessSkillRef[]): HarnessInstallation {
  return resolveHarnessInstallation(skills);
}

export function frameworkForHarness(kind: HarnessKind): AgentFramework | undefined {
  if (kind === 'codex') {
    return 'codex';
  }
  if (kind === 'grok') {
    return 'grok';
  }
  if (kind === 'glm') {
    return 'glm';
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
  if (kind === 'glm') {
    return 'zai';
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
  return computeHarnessCompositionHash(input);
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
