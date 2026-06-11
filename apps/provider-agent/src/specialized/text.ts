import { truncateText } from '@bossraid/proof-ui';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import { providerConfig } from '../config.js';
import { buildGbStudioPlan, type GbStudioPlan } from './gbstudio.js';
import { buildPixelPlan, type PixelPlan, planWithVenice } from './pixel.js';
import { buildVideoPlan, type VideoPlan } from './video.js';

export type TextPlan = {
  answerText: string;
  explanation: string;
  confidence: number;
};

type TextContributionRole = 'lead' | 'risk' | 'constraints' | 'execution' | 'other';

type ProviderMode = 'generic' | 'gbstudio' | 'pixel_art' | 'remotion';

export async function buildGenericTextPlan(task: ProviderTaskPackage): Promise<TextPlan> {
  const fallback: TextPlan = {
    answerText:
      truncateText(task.task.description, 220) ||
      `Mercenary asked ${providerConfig.displayName} for a scoped contribution.`,
    explanation:
      'Produced a constrained text contribution aligned to the supplied workstream scope.',
    confidence: 0.66,
  };

  const planned = await planWithVenice<TextPlan>(
    {
      name: 'generic_text_answer',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['answerText', 'explanation', 'confidence'],
        properties: {
          answerText: { type: 'string' },
          explanation: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    'You are a specialist provider inside Boss Raid. Give one concise contribution for Mercenary to synthesize. Keep the answer role-aligned, direct, and artifact-light unless the task explicitly asks for an asset list. Do not mention hidden chain-of-thought.',
    JSON.stringify(
      { task: task.task, synthesis: task.synthesis, artifacts: task.artifacts },
      null,
      2
    )
  ).catch(() => undefined);
  return planned ?? fallback;
}

function buildTaskHaystack(task: ProviderTaskPackage): string {
  return [
    task.task.framework ?? '',
    task.task.title,
    task.task.description,
    task.artifacts.expectedBehavior,
    task.artifacts.errors.join(' '),
    task.synthesis?.workstreamLabel ?? '',
    task.synthesis?.roleLabel ?? '',
  ]
    .join('\n')
    .toLowerCase();
}

function isGamePackageTextTask(task: ProviderTaskPackage): boolean {
  if (task.desiredOutput.primaryType !== 'text') {
    return false;
  }

  const haystack = buildTaskHaystack(task);
  if (/\bgb[\s-]?studio\b/.test(haystack)) {
    return true;
  }

  const signals = [
    'gameplay',
    'microgame',
    'trailer',
    'pixel',
    'sprite',
    'launch copy',
    'video',
  ].filter((signal) => haystack.includes(signal)).length;
  return signals >= 2;
}

function readTextContributionRole(task: ProviderTaskPackage): TextContributionRole {
  const haystack = [
    task.synthesis?.workstreamId ?? '',
    task.synthesis?.roleId ?? '',
    task.synthesis?.workstreamLabel ?? '',
    task.synthesis?.roleLabel ?? '',
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes('lead-answer') || haystack.includes('answer')) {
    return 'lead';
  }
  if (haystack.includes('risk')) {
    return 'risk';
  }
  if (haystack.includes('constraint')) {
    return 'constraints';
  }
  if (
    haystack.includes('execution') ||
    haystack.includes('action-plan') ||
    haystack.includes('next step')
  ) {
    return 'execution';
  }
  return 'other';
}

function summarizeItems(values: string[], limit = 3): string {
  return values
    .map((value) => truncateText(value, 72))
    .filter((value) => value.length > 0)
    .slice(0, limit)
    .join(', ');
}

function buildGbStudioTextPlan(task: ProviderTaskPackage, plan: GbStudioPlan): TextPlan {
  const role = readTextContributionRole(task);
  const roomScope = summarizeItems(plan.roomPlan, 2);
  const gameplayScope = summarizeItems(plan.gameplayChanges, 2);

  switch (role) {
    case 'lead':
      return {
        answerText: `${plan.conceptSummary} Keep the build to one readable room with the key, the ${plan.npcName}, the exit, and the timer driving the loop.`,
        explanation: "Returned the gameplay-led answer for Mercenary's final synthesis.",
        confidence: 0.82,
      };
    case 'risk':
      return {
        answerText: `Keep the scope to one room and one readable boss pattern. Extra rooms, combat layers, or unclear HUD states will make the build feel unfinished.`,
        explanation: "Returned the gameplay risk note for Mercenary's final synthesis.",
        confidence: 0.79,
      };
    case 'constraints':
      return {
        answerText: `Preserve only the ${plan.sceneName} slice and the systems needed to read the run in one glance: ${gameplayScope || 'timer, key state, boss pressure, and exit gating'}.`,
        explanation: "Returned the gameplay boundary note for Mercenary's final synthesis.",
        confidence: 0.78,
      };
    case 'execution':
      return {
        answerText:
          `Start by locking the ${plan.sceneName} room and core loop, then align the art pack and trailer to that same slice. ${roomScope || ''}`.trim(),
        explanation: "Returned the gameplay next-step note for Mercenary's final synthesis.",
        confidence: 0.8,
      };
    default:
      return {
        answerText: `${plan.conceptSummary} ${roomScope || gameplayScope}`,
        explanation: "Returned a concise gameplay contribution for Mercenary's final synthesis.",
        confidence: 0.8,
      };
  }
}

function buildPixelTextPlan(task: ProviderTaskPackage, plan: PixelPlan): TextPlan {
  const role = readTextContributionRole(task);
  const assetScope = summarizeItems(plan.assetList, 4);

  switch (role) {
    case 'lead':
      return {
        answerText: `${plan.summary} Reuse one palette and only ship the assets the playable slice actually needs.`,
        explanation: "Returned the art-led answer for Mercenary's final synthesis.",
        confidence: 0.8,
      };
    case 'risk':
      return {
        answerText: `Unreadable silhouettes or extra decorative assets will dilute the package. Keep each sprite legible at gameplay scale and keep the palette consistent across the whole launch set.`,
        explanation: "Returned the art risk note for Mercenary's final synthesis.",
        confidence: 0.77,
      };
    case 'constraints':
      return {
        answerText: `Limit the art pack to the core ship list: ${assetScope || 'player, boss, key, exit, floor, wall, and HUD'}. Do not branch into extra characters or props outside the one-room loop.`,
        explanation: "Returned the art boundary note for Mercenary's final synthesis.",
        confidence: 0.76,
      };
    case 'execution':
      return {
        answerText: `Lock the palette first, then finish the smallest asset pack that unblocks the build and trailer: ${assetScope || 'the gameplay-critical sprite set'}.`,
        explanation: "Returned the art handoff note for Mercenary's final synthesis.",
        confidence: 0.78,
      };
    default:
      return {
        answerText: `${plan.summary} Focus on ${assetScope || 'the gameplay-critical asset pack'} and keep the palette coherent.`,
        explanation: "Returned a concise art contribution for Mercenary's final synthesis.",
        confidence: 0.78,
      };
  }
}

function buildVideoTextPlan(task: ProviderTaskPackage, plan: VideoPlan): TextPlan {
  const role = readTextContributionRole(task);
  const launchAngle = summarizeItems(plan.launchCopy, 2);

  switch (role) {
    case 'lead':
      return {
        answerText: `${plan.scriptSummary} The trailer should sell the timer, key, slime, and exit in one quick read.`,
        explanation: "Returned the promo-led answer for Mercenary's final synthesis.",
        confidence: 0.8,
      };
    case 'risk':
      return {
        answerText: `If the trailer introduces mechanics or scenes the playable slice does not ship, the package will feel fake. Keep every beat anchored to the one-room loop.`,
        explanation: "Returned the promo risk note for Mercenary's final synthesis.",
        confidence: 0.77,
      };
    case 'constraints':
      return {
        answerText:
          `Stay inside ${plan.durationSec} seconds and only claim the mechanics the build actually contains. ${launchAngle || ''}`.trim(),
        explanation: "Returned the promo boundary note for Mercenary's final synthesis.",
        confidence: 0.76,
      };
    case 'execution':
      return {
        answerText: `Capture the locked gameplay slice first, then cut the ${plan.durationSec}-second teaser around the key pickup, boss pressure, and exit reveal.`,
        explanation: "Returned the promo next-step note for Mercenary's final synthesis.",
        confidence: 0.78,
      };
    default:
      return {
        answerText: `${plan.scriptSummary} ${launchAngle}`,
        explanation: "Returned a concise promo contribution for Mercenary's final synthesis.",
        confidence: 0.78,
      };
  }
}

export function domainMatchesMode(mode: ProviderMode, task: ProviderTaskPackage): boolean {
  const haystack = [
    task.task.framework ?? '',
    task.task.description,
    task.synthesis?.workstreamLabel ?? '',
    task.synthesis?.roleLabel ?? '',
  ]
    .join('\n')
    .toLowerCase();

  if (mode === 'gbstudio') {
    return haystack.includes('gb-studio') || haystack.includes('gameplay');
  }
  if (mode === 'pixel_art') {
    return haystack.includes('pixel') || haystack.includes('sprite') || haystack.includes('art');
  }
  if (mode === 'remotion') {
    return (
      haystack.includes('remotion') || haystack.includes('promo') || haystack.includes('video')
    );
  }
  return false;
}

export async function maybeBuildSpecializedTextPlan(
  mode: ProviderMode,
  task: ProviderTaskPackage
): Promise<TextPlan | undefined> {
  if (task.desiredOutput.primaryType !== 'text') {
    return undefined;
  }

  if (mode === 'gbstudio' && domainMatchesMode(mode, task)) {
    return buildGbStudioTextPlan(task, await buildGbStudioPlan(task));
  }

  if (mode === 'pixel_art' && (domainMatchesMode(mode, task) || isGamePackageTextTask(task))) {
    return buildPixelTextPlan(task, await buildPixelPlan(task));
  }

  if (mode === 'remotion' && (domainMatchesMode(mode, task) || isGamePackageTextTask(task))) {
    return buildVideoTextPlan(task, await buildVideoPlan(task));
  }

  return undefined;
}
