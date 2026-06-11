import type { ProviderTaskPackage, SubmissionArtifact } from '@bossraid/shared-types';
import { providerConfig } from '../config.js';
import { ArtifactBuilder, createBundleArtifact, createFileArtifact } from '../artifacts.js';
import type { ModelSubmission } from '../types.js';
import { buildGbStudioPatch, buildGbStudioPlan, produceGbStudioBundle } from './gbstudio.js';
import { buildPixelPlan, producePixelBundle } from './pixel.js';
import { buildGenericTextPlan, domainMatchesMode, maybeBuildSpecializedTextPlan } from './text.js';
import { buildVideoPlan, produceVideoBundle } from './video.js';

type ProviderMode = 'generic' | 'gbstudio' | 'pixel_art' | 'remotion';

function describeBundleArtifacts(
  bundle: ReturnType<ArtifactBuilder['inlineAll']>,
  prefix: string,
  options: {
    allowVideoFallback?: boolean;
  } = {}
): SubmissionArtifact[] {
  const files = bundle.files;
  const videoHighlights: SubmissionArtifact[] = [];
  const imageHighlights: SubmissionArtifact[] = [];
  const fallbackVideoFile = options.allowVideoFallback
    ? (files.find((file) => file.relativePath.endsWith('preview.gif')) ??
      files.find((file) => file.relativePath.endsWith('storyboard.png')) ??
      files.find((file) => file.relativePath.endsWith('frames/frame-01.png')) ??
      files.find((file) => file.mimeType.startsWith('image/')))
    : undefined;

  for (const file of files) {
    if (file.mimeType.startsWith('video/')) {
      videoHighlights.push(
        createFileArtifact('video', `${prefix} preview`, 'Generated video artifact.', file)
      );
      continue;
    }
    if (file.mimeType.startsWith('image/')) {
      imageHighlights.push(
        createFileArtifact(
          'image',
          `${prefix} ${file.relativePath}`,
          'Generated image artifact.',
          file
        )
      );
    }
  }

  if (videoHighlights.length === 0 && fallbackVideoFile) {
    videoHighlights.push(
      createFileArtifact(
        'video',
        `${prefix} storyboard preview`,
        'Storyboard fallback used when encoded video output was unavailable.',
        fallbackVideoFile
      )
    );
  }

  const visibleImages = fallbackVideoFile
    ? imageHighlights.filter(
        (artifact) =>
          artifact.uri !== `data:${fallbackVideoFile.mimeType};base64,${fallbackVideoFile.data}`
      )
    : imageHighlights;

  return uniqueArtifacts([
    ...videoHighlights.slice(0, 1),
    ...visibleImages.slice(0, 5),
    createBundleArtifact(
      bundle,
      `${prefix} bundle`,
      `Inline bundle with ${bundle.files.length} generated files.`
    ),
  ]);
}

function uniqueArtifacts(artifacts: SubmissionArtifact[]): SubmissionArtifact[] {
  const seen = new Set<string>();
  const output: SubmissionArtifact[] = [];
  for (const artifact of artifacts) {
    const key = `${artifact.outputType}:${artifact.uri}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(artifact);
  }
  return output;
}

export async function maybeRequestSpecializedSubmission(
  task: ProviderTaskPackage
): Promise<ModelSubmission | undefined> {
  const mode = providerConfig.providerMode as ProviderMode;
  if (mode === 'generic') {
    return undefined;
  }

  const specializedText = await maybeBuildSpecializedTextPlan(mode, task);
  if (specializedText) {
    return {
      answerText: specializedText.answerText,
      explanation: specializedText.explanation,
      confidence: specializedText.confidence,
      filesTouched: [],
      artifacts: [],
    };
  }

  if (!domainMatchesMode(mode, task) && task.desiredOutput.primaryType === 'text') {
    const generic = await buildGenericTextPlan(task);
    return {
      answerText: generic.answerText,
      explanation: generic.explanation,
      confidence: generic.confidence,
      filesTouched: [],
      artifacts: [],
    };
  }

  if (mode === 'gbstudio') {
    const plan = await buildGbStudioPlan(task);
    const bundle = produceGbStudioBundle(plan);
    const patch = buildGbStudioPatch(task, plan);
    return {
      patchUnifiedDiff: task.desiredOutput.primaryType === 'patch' ? patch.patch : undefined,
      answerText:
        task.desiredOutput.primaryType === 'text'
          ? `${plan.conceptSummary}\n\nGameplay scope:\n${plan.gameplayChanges.map((item) => `- ${item}`).join('\n')}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, 'Gamma'),
      explanation: `${plan.patchSummary} Mercenary can use the inline GB Studio bundle for receipt proof and downstream handoff.`,
      confidence: 0.82,
      filesTouched: task.desiredOutput.primaryType === 'patch' ? patch.filesTouched : [],
    };
  }

  if (mode === 'pixel_art') {
    const plan = await buildPixelPlan(task);
    const bundle = producePixelBundle(plan);
    return {
      answerText:
        task.desiredOutput.primaryType === 'text'
          ? `${plan.summary}\n\nAsset list:\n${plan.assetList.map((item) => `- ${item}`).join('\n')}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, 'Dottie'),
      explanation: `${plan.summary} Included inline pixel-art files, a spritesheet, and bundle metadata.`,
      confidence: 0.8,
      filesTouched: [],
    };
  }

  if (mode === 'remotion') {
    const plan = await buildVideoPlan(task);
    const bundle = produceVideoBundle(plan);
    return {
      answerText:
        task.desiredOutput.primaryType === 'text'
          ? `${plan.scriptSummary}\n\nLaunch copy:\n${plan.launchCopy.map((item) => `- ${item}`).join('\n')}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, 'Riko', { allowVideoFallback: true }),
      explanation: `${plan.scriptSummary} Included storyboard frames, captions, Remotion source, and a playable preview render with MP4 preferred and animated GIF fallback.`,
      confidence: 0.8,
      filesTouched: [],
    };
  }

  return undefined;
}

export function attachContributionRole(
  submission: ModelSubmission,
  task: ProviderTaskPackage
): ModelSubmission {
  if (task.synthesis == null) {
    return submission;
  }

  return {
    ...submission,
    contributionRole: {
      id: task.synthesis.roleId,
      label: task.synthesis.roleLabel,
      objective: task.synthesis.roleObjective,
      workstreamId: task.synthesis.workstreamId,
      workstreamLabel: task.synthesis.workstreamLabel,
      workstreamObjective: task.synthesis.workstreamObjective,
    },
  };
}

export function submissionSupportsRequestedOutput(
  submission: ModelSubmission,
  task: ProviderTaskPackage
): boolean {
  const primaryType = task.desiredOutput.primaryType;
  if (primaryType === 'patch') {
    return (
      typeof submission.patchUnifiedDiff === 'string' && submission.patchUnifiedDiff.length > 0
    );
  }
  if (primaryType === 'text' || primaryType === 'json') {
    return typeof submission.answerText === 'string' && submission.answerText.length > 0;
  }
  return (
    Array.isArray(submission.artifacts) &&
    submission.artifacts.some((artifact) => artifact.outputType === primaryType)
  );
}
