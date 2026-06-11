import type { ProviderProfile, RaidTaskSpec } from '@bossraid/shared-types';

export type TextDomainCategory = 'implementation' | 'art' | 'promo';

export const TEXT_DOMAIN_SIGNAL_RULES: Array<{
  category: TextDomainCategory;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    category: 'implementation',
    weight: 4,
    patterns: [/\bgb[\s-]?studio\b/i, /\bplayable\b/i, /\bmicrogame\b/i],
  },
  {
    category: 'implementation',
    weight: 3,
    patterns: [/\bgameplay\b/i, /\bscene\b/i, /\bmechanic\b/i, /\bbuild\b/i, /\bimplement\b/i],
  },
  {
    category: 'art',
    weight: 3,
    patterns: [/\bpixel[\s-]?art\b/i, /\bsprite\b/i, /\btileset\b/i, /\btitle card\b/i],
  },
  {
    category: 'art',
    weight: 2,
    patterns: [/\bpalette\b/i, /\basset pack\b/i, /\bart pack\b/i, /\bvisual\b/i],
  },
  {
    category: 'promo',
    weight: 4,
    patterns: [/\btrailer\b/i, /\bteaser\b/i, /\bremotion\b/i],
  },
  {
    category: 'promo',
    weight: 2,
    patterns: [/\blaunch copy\b/i, /\bmarketing\b/i, /\bpromo\b/i, /\bvideo\b/i],
  },
];

export const TEXT_DOMAIN_PROVIDER_HINTS: Record<TextDomainCategory, string[]> = {
  implementation: [
    'gb-studio',
    'gbstudio',
    'gameplay',
    'game-development',
    'systems-design',
    'implementation',
    'builder',
  ],
  art: [
    'pixel-art',
    'pixel-artist',
    'sprites',
    'sprite',
    'tileset',
    'title-card',
    'illustration',
    'art',
  ],
  promo: [
    'remotion',
    'video-marketing',
    'video-marketer',
    'game-marketing',
    'trailer',
    'launch-copy',
    'marketing',
    'motion-design',
  ],
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeCapabilityToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

function buildTextTaskHaystack(task: RaidTaskSpec): string {
  return [
    task.taskTitle,
    task.taskDescription,
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    ...task.failingSignals.errors,
    ...task.files.map((file) => file.path),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();
}

function collectTextDomainWeights(task: RaidTaskSpec): Map<TextDomainCategory, number> {
  const haystack = buildTextTaskHaystack(task);
  const weights = new Map<TextDomainCategory, number>();

  for (const rule of TEXT_DOMAIN_SIGNAL_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(haystack))) {
      continue;
    }
    weights.set(rule.category, (weights.get(rule.category) ?? 0) + rule.weight);
  }

  return weights;
}

export function classifyTextDomain(task: RaidTaskSpec): TextDomainCategory | null {
  const weights = collectTextDomainWeights(task);
  let bestCategory: TextDomainCategory | null = null;
  let bestWeight = 0;

  for (const [category, weight] of weights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestCategory = category;
    }
  }

  return bestCategory;
}

export function providerMatchesTextDomain(
  provider: ProviderProfile,
  category: TextDomainCategory
): boolean {
  const offered = new Set(
    [
      ...provider.specializations,
      ...provider.supportedFrameworks,
      ...provider.supportedLanguages,
    ].map(normalizeCapabilityToken)
  );

  return TEXT_DOMAIN_PROVIDER_HINTS[category].some((hint) => offered.has(hint));
}

export function scoreTextDomainFit(provider: ProviderProfile, task: RaidTaskSpec): number {
  if ((task.output?.primaryType ?? 'patch') !== 'text') {
    return 0.5;
  }

  const weights = collectTextDomainWeights(task);
  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (totalWeight === 0) {
    return 0.5;
  }

  let matchedWeight = 0;
  for (const [category, weight] of weights) {
    if (providerMatchesTextDomain(provider, category)) {
      matchedWeight += weight;
    }
  }

  return clamp01(matchedWeight / totalWeight);
}
