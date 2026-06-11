import { basename } from 'node:path';
import { truncateText } from '@bossraid/proof-ui';
import type { SanitizedTaskSpec } from '@bossraid/shared-types';
import { FAMILIES } from './families.js';
import {
  type ContributionFamily,
  type ContributionFamilyId,
  type ContributionRolePlan,
  type ContributionRoleTemplate,
  type ContributionWorkstreamAllocation,
  type ContributionWorkstreamTemplate,
  type TaskPlanningContext,
} from './types.js';

export function buildContributionRolePlan(input: {
  task: SanitizedTaskSpec;
  providerIndex: number;
  totalExperts: number;
  providerSpecializations?: string[];
}): ContributionRolePlan {
  const templates = buildContributionRoleSequence({
    task: input.task,
    totalExperts: input.totalExperts,
  });
  const template =
    templates[Math.max(0, input.providerIndex - 1)] ?? templates[templates.length - 1]!;
  const specializationNote =
    input.providerSpecializations != null && input.providerSpecializations.length > 0
      ? `Lean on these strengths when they help: ${input.providerSpecializations.slice(0, 3).join(', ')}.`
      : undefined;

  return {
    id: template.id,
    label: template.label,
    objective: template.objective,
    prompt: [template.prompt, specializationNote].filter(Boolean).join(' '),
    workstreamId: template.workstreamId,
    workstreamLabel: template.workstreamLabel,
    workstreamObjective: template.workstreamObjective,
  };
}

export function buildContributionRoleSequence(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
}): ContributionRolePlan[] {
  const allocations = buildContributionWorkstreamAllocations(input);

  return allocations.flatMap((allocation) =>
    expandRoleTemplates(allocation.template, allocation.assignedExperts).map((role) => ({
      id: role.id,
      label: role.label,
      objective: role.objective,
      prompt: role.prompt,
      workstreamId: allocation.template.id,
      workstreamLabel: allocation.template.label,
      workstreamObjective: allocation.template.objective,
    }))
  );
}

export function buildContributionWorkstreamAllocations(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
  familyId?: ContributionFamilyId;
}): ContributionWorkstreamAllocation[] {
  const family = getContributionFamily(input.familyId ?? getRootContributionFamilyId(input.task));
  const authoredWorkstreams = authorContributionFamilyWorkstreams(input.task, family.workstreams);
  const activeTemplates = authoredWorkstreams.slice(
    0,
    Math.min(Math.max(1, input.totalExperts), authoredWorkstreams.length)
  );
  const allocation = new Map(activeTemplates.map((template) => [template.id, 1]));
  let remaining = Math.max(0, input.totalExperts - activeTemplates.length);

  while (remaining > 0) {
    const next = selectExpansionTarget(activeTemplates, allocation);
    allocation.set(next.id, (allocation.get(next.id) ?? 0) + 1);
    remaining -= 1;
  }

  return activeTemplates.map((template) => ({
    template,
    assignedExperts: allocation.get(template.id) ?? 1,
  }));
}

export function getRootContributionFamilyId(task: SanitizedTaskSpec): ContributionFamilyId {
  if (taskCanRouteThroughGameWorkstreams(task) && isGameTask(task)) {
    return 'game_root';
  }
  return (task.output?.primaryType ?? 'patch') === 'patch' ? 'patch_root' : 'text_root';
}

export function getContributionFamily(familyId: ContributionFamilyId): ContributionFamily {
  return FAMILIES[familyId];
}

export function getContributionWorkstreamTemplate(
  task: SanitizedTaskSpec,
  workstreamId: string
): ContributionWorkstreamTemplate | undefined {
  for (const family of Object.values(FAMILIES)) {
    const authored = authorContributionFamilyWorkstreams(task, family.workstreams).find(
      (template) => template.id === workstreamId
    );
    if (authored) {
      return authored;
    }
  }

  return undefined;
}

function expandRoleTemplates(
  template: ContributionWorkstreamTemplate,
  totalExperts: number
): ContributionRoleTemplate[] {
  return Array.from({ length: Math.max(1, totalExperts) }, (_, index) => {
    return template.roles[index] ?? template.roles[index % template.roles.length]!;
  });
}

function selectExpansionTarget(
  templates: ContributionWorkstreamTemplate[],
  allocation: Map<string, number>
): ContributionWorkstreamTemplate {
  return templates.reduce((best, current) => {
    const bestScore = scoreExpansion(best, allocation.get(best.id) ?? 1);
    const currentScore = scoreExpansion(current, allocation.get(current.id) ?? 1);
    return currentScore > bestScore ? current : best;
  });
}

function scoreExpansion(template: ContributionWorkstreamTemplate, currentExperts: number): number {
  return template.expansionBias / Math.max(currentExperts, 1);
}

function authorContributionFamilyWorkstreams(
  task: SanitizedTaskSpec,
  workstreams: ContributionWorkstreamTemplate[]
): ContributionWorkstreamTemplate[] {
  const context = buildTaskPlanningContext(task);
  return workstreams.map((workstream) => ({
    ...workstream,
    objective: authorWorkstreamObjective(workstream, context),
    routeSpecializations: authorRouteSpecializations(task, workstream),
    roles: workstream.roles.map((role) => ({
      ...role,
      objective: authorRoleObjective(role.id, context, role.objective),
      prompt: authorRolePrompt(role.id, context, role.prompt),
    })),
  }));
}

function buildTaskPlanningContext(task: SanitizedTaskSpec): TaskPlanningContext {
  const focusLabel = buildFocusLabel(task);
  const signalCandidate =
    task.failingSignals.errors[0] ??
    task.failingSignals.observedBehavior ??
    task.failingSignals.expectedBehavior;

  return {
    focusLabel,
    surfacePhrase: buildSurfacePhrase(task),
    signalLabel: signalCandidate == null ? undefined : truncateText(signalCandidate, 100),
  };
}

function authorRouteSpecializations(
  task: SanitizedTaskSpec,
  workstream: ContributionWorkstreamTemplate
): string[] | undefined {
  const inherited = workstream.routeSpecializations ?? [];
  if ((task.output?.primaryType ?? 'patch') !== 'text' || !isGameTask(task)) {
    return inherited;
  }

  const id = workstream.id;
  let preferred: string[] = [];

  if (
    id === 'answer' ||
    id.startsWith('answer-') ||
    id === 'execution' ||
    id.startsWith('execution-')
  ) {
    preferred = ['gb-studio'];
  } else if (id === 'constraints' || id.startsWith('constraints-')) {
    preferred = ['pixel-art'];
  } else if (id === 'risk' || id.startsWith('risk-')) {
    preferred = ['remotion'];
  }

  return uniqueRouteSpecializations([...inherited, ...preferred]);
}

function uniqueRouteSpecializations(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function taskCanRouteThroughGameWorkstreams(task: SanitizedTaskSpec): boolean {
  const primaryType = task.output?.primaryType ?? 'patch';
  return (
    primaryType === 'patch' ||
    task.output?.artifactTypes?.includes('patch') === true ||
    task.constraints.allowedOutputTypes?.includes('patch') === true
  );
}

function isGameTask(task: SanitizedTaskSpec): boolean {
  const haystack = [
    task.framework,
    task.taskTitle,
    task.taskDescription,
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    ...task.failingSignals.errors,
    ...task.constraints.requireSpecializations,
    ...task.files.map((file) => file.path),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  if (haystack.length === 0) {
    return false;
  }

  if (/\bgb[\s-]?studio\b/.test(haystack)) {
    return true;
  }

  const strongSignals = [
    'pixel art',
    'pixel-art',
    'sprite',
    'tileset',
    'tilemap',
    'remotion',
    'trailer',
    'launch copy',
    'video marketing',
  ].filter((signal) => haystack.includes(signal)).length;

  if (strongSignals >= 2) {
    return true;
  }

  return /\bgame(play)?\b/.test(haystack) && strongSignals >= 1;
}

function buildFocusLabel(task: SanitizedTaskSpec): string {
  const candidates = [
    task.taskTitle,
    task.failingSignals.errors[0],
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    task.taskDescription,
    task.files[0]?.path,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeFocusCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return (task.output?.primaryType ?? 'patch') === 'patch'
    ? 'the requested fix'
    : 'the requested answer';
}

function normalizeFocusCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  let normalized = value
    .replace(/\s+/g, ' ')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '');

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes('/')) {
    normalized = basename(normalized);
  }

  normalized = normalized
    .replace(
      /^(fix|debug|resolve|inspect|explain|analyze|analyse|review|investigate|create|build|implement|plan|write|summarize|compare|describe)\s+/i,
      ''
    )
    .replace(/^the\s+/i, '');

  const andIndex = normalized.search(/\sand\s/i);
  if (andIndex !== -1) {
    const head = normalized.slice(0, andIndex).trim();
    const tail = normalized.slice(andIndex + 5).trim();
    if (
      /\b(explain|describe|fix|debug|review|summarize|compare|plan|show|tell)\b/i.test(tail) &&
      head.length >= 4
    ) {
      normalized = head;
    }
  }

  normalized = normalized
    .replace(/\bplease\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length < 4) {
    return undefined;
  }

  return truncateText(normalized, 64);
}

function buildSurfacePhrase(task: SanitizedTaskSpec): string {
  if (task.files.length > 0) {
    const primaryFile = basename(task.files[0]!.path);
    return `the code around ${primaryFile}`;
  }

  if (task.framework && task.language !== 'text') {
    return `the ${task.framework} ${task.language} context`;
  }

  if (task.framework) {
    return `the ${task.framework} context`;
  }

  if (task.language !== 'text') {
    return `the ${task.language} context`;
  }

  return 'the supplied context';
}

function authorWorkstreamObjective(
  template: ContributionWorkstreamTemplate,
  context: TaskPlanningContext
): string {
  const focus = context.focusLabel;

  switch (true) {
    case template.id === 'gameplay':
      return `Produce the playable build for ${focus}.`;
    case template.id.startsWith('gameplay-core'):
      return `Produce the main GB Studio patch for ${focus}.`;
    case template.id.startsWith('gameplay-qa'):
      return `Find broken loops and missing validation around ${focus}.`;
    case template.id.startsWith('gameplay-scope'):
      return `Lock the smallest safe gameplay scope for ${focus}.`;
    case template.id.startsWith('gameplay-handoff'):
      return `Turn ${focus} into a clean gameplay handoff.`;
    case template.id === 'pixel-art':
      return `Define the pixel-art pack for ${focus}.`;
    case template.id.startsWith('art-direction'):
      return `Lock the art direction for ${focus}.`;
    case template.id.startsWith('art-assets'):
      return `List the concrete sprites, tiles, and UI parts for ${focus}.`;
    case template.id.startsWith('art-animation'):
      return `Define the animation notes for ${focus}.`;
    case template.id.startsWith('art-handoff'):
      return `Turn the art plan for ${focus} into a clean builder handoff.`;
    case template.id === 'video-marketing':
      return `Turn ${focus} into a trailer and launch angle.`;
    case template.id.startsWith('promo-core'):
      return `Define the core trailer angle for ${focus}.`;
    case template.id.startsWith('promo-render'):
      return `Produce the trailer asset or render handoff for ${focus}.`;
    case template.id.startsWith('promo-script'):
      return `Write the trailer script for ${focus}.`;
    case template.id.startsWith('promo-launch-copy'):
      return `Write the short launch copy pack for ${focus}.`;
    case template.id === 'diagnosis':
      return `Explain what is broken in ${focus}.`;
    case template.id.startsWith('diagnosis-core'):
      return `Pin down the smallest valid explanation of ${focus}.`;
    case template.id.startsWith('diagnosis-repro'):
      return `Reduce ${focus} to a short reproducible path.`;
    case template.id.startsWith('diagnosis-surface'):
      return `Map the files and interfaces that matter to ${focus}.`;
    case template.id.startsWith('diagnosis-constraints'):
      return `Expose uncertainty and risky assumptions around ${focus}.`;
    case template.id === 'implementation':
      return `Produce the concrete fix for ${focus}.`;
    case template.id.startsWith('implementation-core'):
      return `Produce the main implementation diff for ${focus}.`;
    case template.id.startsWith('implementation-safety'):
      return `Stress test the implementation for ${focus} for safety and scope control.`;
    case template.id.startsWith('implementation-merge'):
      return `Reduce merge friction around the implementation for ${focus}.`;
    case template.id.startsWith('implementation-validation'):
      return `Turn the implementation for ${focus} into a concise validation path.`;
    case template.id.startsWith('implementation-fallback'):
      return `Preserve rollback and fallback options around ${focus}.`;
    case template.id === 'verification':
      return `Stress test the likely fix for ${focus}.`;
    case template.id.startsWith('verification-core'):
      return `Find the most likely ways the fix for ${focus} could still fail.`;
    case template.id.startsWith('verification-edge-cases'):
      return `Hunt for edge cases around ${focus}.`;
    case template.id.startsWith('verification-contracts'):
      return `Check that the fix for ${focus} still matches surrounding contracts.`;
    case template.id.startsWith('verification-runtime'):
      return `Define the shortest runtime or test path for ${focus}.`;
    case template.id === 'delivery':
      return `Turn the fix for ${focus} into rollout and validation notes.`;
    case template.id === 'answer':
      return `Produce the direct synthesized answer for ${focus}.`;
    case template.id.startsWith('answer-core'):
      return `Produce the main answer body for ${focus}.`;
    case template.id.startsWith('answer-evidence'):
      return `Support the answer for ${focus} with the strongest rationale.`;
    case template.id.startsWith('answer-clarity'):
      return `Tighten the answer for ${focus} for readability and precision.`;
    case template.id.startsWith('answer-limits'):
      return `Expose limits and unsupported assumptions around ${focus}.`;
    case template.id.startsWith('answer-alternatives'):
      return `Offer competing framings of ${focus} worth comparing.`;
    case template.id === 'constraints':
      return `Find missing context and unsupported assumptions around ${focus}.`;
    case template.id.startsWith('constraints-core'):
      return `Find the strongest missing-context risk around ${focus}.`;
    case template.id.startsWith('constraints-boundaries'):
      return `Identify hard boundaries around what can be claimed about ${focus}.`;
    case template.id.startsWith('constraints-dependencies'):
      return `Identify hidden dependencies behind ${focus}.`;
    case template.id.startsWith('constraints-ambiguity'):
      return `Expose ambiguous wording that affects ${focus}.`;
    case template.id === 'risk':
      return `Find caveats and failure modes around ${focus}.`;
    case template.id.startsWith('risk-core'):
      return `Find the most important caveats around ${focus}.`;
    case template.id.startsWith('risk-counterexamples'):
      return `Find concrete counterexamples against ${focus}.`;
    case template.id.startsWith('risk-abuse'):
      return `Look for misuse or dangerous follow-on actions around ${focus}.`;
    case template.id.startsWith('risk-uncertainty'):
      return `Explain what remains unknown about ${focus}.`;
    case template.id === 'execution':
      return `Turn ${focus} into the safest next-step plan.`;
    case template.id.startsWith('execution-core'):
      return `Turn ${focus} into the best immediate next-step plan.`;
    case template.id.startsWith('execution-validation'):
      return `State how the caller should validate the next step for ${focus}.`;
    case template.id.startsWith('execution-ordering'):
      return `Order the next steps for ${focus} to reduce risk and rework.`;
    case template.id.startsWith('execution-fallback'):
      return `Preserve fallback options if the first step around ${focus} fails.`;
    default:
      return template.objective;
  }
}

function authorRoleObjective(
  roleId: string,
  context: TaskPlanningContext,
  fallback: string
): string {
  const focus = context.focusLabel;

  switch (roleId) {
    case 'gb-studio-builder':
    case 'gameplay-builder':
      return `Build the playable GB Studio version of ${focus}.`;
    case 'gameplay-qa':
      return `Find blocked progress, missing hooks, and brittle logic around ${focus}.`;
    case 'mechanic-scope':
      return `Constrain ${focus} to the smallest complete gameplay slice.`;
    case 'asset-handoff':
      return `List the exact scene, event, and asset handoff for ${focus}.`;
    case 'pixel-artist':
    case 'art-director':
      return `Define the visual direction and asset plan for ${focus}.`;
    case 'sprite-planner':
      return `Turn ${focus} into a concrete sprite and tile checklist.`;
    case 'animation-planner':
      return `Describe the minimal animation beats for ${focus}.`;
    case 'art-handoff':
      return `Package the art plan for ${focus} into a clean builder handoff.`;
    case 'video-marketer':
    case 'promo-strategist':
      return `Turn ${focus} into the strongest trailer hook and launch angle.`;
    case 'video-editor':
      return `Turn ${focus} into a trailer-ready video artifact or render handoff.`;
    case 'trailer-writer':
      return `Write the shortest trailer script that sells ${focus}.`;
    case 'launch-copywriter':
      return `Write the short launch copy pack for ${focus}.`;
    case 'root-cause':
      return `Isolate exactly why ${focus} fails.`;
    case 'repro-reduction':
      return `Reduce ${focus} to the shortest reproducible sequence.`;
    case 'failure-trace':
      return `Describe where ${focus} becomes visible to the caller.`;
    case 'surface-mapping':
      return `Map the narrowest code surface that matters to ${focus}.`;
    case 'constraint-check':
      return `Find missing context or unsupported assumptions around ${focus}.`;
    case 'patch-author':
      return `Write the safest concrete fix for ${focus}.`;
    case 'patch-safety':
      return `Find unsafe edits or brittle assumptions around the fix for ${focus}.`;
    case 'side-effect-scan':
      return `Look for hidden behavior changes the fix for ${focus} could trigger.`;
    case 'patch-merge':
      return `Reduce merge friction around the fix for ${focus}.`;
    case 'diff-shape':
      return `Keep the diff for ${focus} compact and easy to review.`;
    case 'patch-validation':
    case 'acceptance-checks':
    case 'runtime-checks':
      return `Define the shortest checks that validate the fix for ${focus}.`;
    case 'rollback-plan':
      return `State the safest rollback posture if the fix for ${focus} misbehaves.`;
    case 'regression-review':
    case 'edge-case-hunter':
      return `Find the strongest regression and edge-case risks around ${focus}.`;
    case 'contract-check':
      return `Check that the fix for ${focus} still matches surrounding contracts.`;
    case 'change-explainer':
      return `Turn the fix for ${focus} into a concise rollout note.`;
    case 'lead-answer':
      return `State the direct answer for ${focus} with the highest confidence.`;
    case 'evidence-review':
    case 'cross-check':
      return `Pull the strongest supporting rationale for ${focus}.`;
    case 'clarity-pass':
      return `Rewrite the answer for ${focus} into shorter, clearer language.`;
    case 'limit-check':
    case 'boundary-check':
      return `Expose the main support limits around ${focus}.`;
    case 'alternative-framing':
      return `Offer the strongest alternative framing of ${focus}.`;
    case 'dependency-check':
      return `Find hidden dependencies behind ${focus}.`;
    case 'ambiguity-check':
      return `Expose ambiguous wording that changes how ${focus} should be read.`;
    case 'risk-review':
    case 'counterexample-hunt':
      return `Find caveats and counterexamples around ${focus}.`;
    case 'abuse-case-review':
      return `Look for unsafe follow-on uses of the answer for ${focus}.`;
    case 'uncertainty-note':
      return `Capture the main unresolved uncertainty around ${focus}.`;
    case 'action-plan':
      return `Turn ${focus} into a low-risk next-step recommendation.`;
    case 'validation-plan':
      return `State how the caller should validate the next step for ${focus}.`;
    case 'step-ordering':
      return `Order the safest next steps around ${focus}.`;
    case 'fallback-plan':
      return `Describe the fallback if the first step around ${focus} fails.`;
    default:
      return fallback;
  }
}

function authorRolePrompt(roleId: string, context: TaskPlanningContext, fallback: string): string {
  const focus = context.focusLabel;
  const signalNote = context.signalLabel ? ` Anchor on this signal: ${context.signalLabel}.` : '';

  switch (roleId) {
    case 'gb-studio-builder':
      return `Implement the playable GB Studio scene, events, and repo edits needed for ${focus}.${signalNote}`;
    case 'gameplay-builder':
      return `Write the core GB Studio repo changes that make ${focus} playable end to end.${signalNote}`;
    case 'gameplay-qa':
      return `Assume another provider builds ${focus}. Focus on dead ends, missing triggers, scene transitions, and validation steps.${signalNote}`;
    case 'mechanic-scope':
      return `State the smallest complete gameplay slice Mercenary should preserve for ${focus}.${signalNote}`;
    case 'asset-handoff':
      return `List the exact asset hooks, scene names, and event expectations the final build for ${focus} needs.${signalNote}`;
    case 'pixel-artist':
      return `Produce a pixel-art brief for ${focus} with palette, sprite list, tile plan, canvas sizes, and animation notes.${signalNote}`;
    case 'art-director':
      return `Define the visual direction for ${focus} so it reads coherently in a Game Boy-scale frame.${signalNote}`;
    case 'sprite-planner':
      return `List the concrete asset pack for ${focus} with canvas sizes, counts, and reuse rules.${signalNote}`;
    case 'animation-planner':
      return `Specify the minimal animation beats that make ${focus} feel alive without widening scope.${signalNote}`;
    case 'art-handoff':
      return `Present the art brief for ${focus} as a clean build handoff with no missing dimensions or naming ambiguity.${signalNote}`;
    case 'video-marketer':
      return `Produce the trailer hook, shot list, CTA, and launch copy that best sells ${focus}.${signalNote}`;
    case 'promo-strategist':
      return `Define the single strongest hook and launch framing for ${focus}.${signalNote}`;
    case 'video-editor':
      return `Produce the promo render artifact or final video handoff that best sells ${focus}.${signalNote}`;
    case 'trailer-writer':
      return `Write the trailer beats, captions, and CTA for ${focus} in the order they should land.${signalNote}`;
    case 'launch-copywriter':
      return `Produce the short copy pack Mercenary can reuse to launch ${focus}.${signalNote}`;
    case 'root-cause':
      return `Focus on why ${focus} fails within ${context.surfacePhrase}.${signalNote}`;
    case 'repro-reduction':
      return `Reduce ${focus} to the shortest concrete repro path inside ${context.surfacePhrase}.${signalNote}`;
    case 'failure-trace':
      return `Call out the state transition or code path where ${focus} becomes visible.${signalNote}`;
    case 'surface-mapping':
      return `List the narrowest files, modules, or interfaces inside ${context.surfacePhrase} that matter to ${focus}.${signalNote}`;
    case 'constraint-check':
      return `Call out missing context, ambiguity, or unsupported assumptions around ${focus}.${signalNote}`;
    case 'patch-author':
      return `Write the minimal patch that resolves ${focus} within ${context.surfacePhrase}.${signalNote}`;
    case 'patch-safety':
      return `Review the likely patch for ${focus} for unsafe scope changes, brittle assumptions, and rollback risk.${signalNote}`;
    case 'side-effect-scan':
      return `Focus on hidden callers, state transitions, and side effects the fix for ${focus} might disturb.${signalNote}`;
    case 'patch-merge':
      return `Look for ways to make the fix for ${focus} easier to merge and reconcile with adjacent changes.${signalNote}`;
    case 'diff-shape':
      return `Call out how to keep the final diff for ${focus} compact and easy to review.${signalNote}`;
    case 'patch-validation':
    case 'acceptance-checks':
    case 'runtime-checks':
      return `State the shortest objective checks that prove the fix for ${focus} is acceptable.${signalNote}`;
    case 'rollback-plan':
      return `Describe the cleanest rollback or fallback posture if the fix for ${focus} fails.${signalNote}`;
    case 'regression-review':
      return `Assume another provider wrote the fix for ${focus}. Focus on regressions, edge cases, and scope control.${signalNote}`;
    case 'edge-case-hunter':
      return `List concrete edge cases or boundary conditions where the fix for ${focus} could still fail.${signalNote}`;
    case 'contract-check':
      return `Look for interfaces, invariants, or hidden assumptions the fix for ${focus} could violate.${signalNote}`;
    case 'change-explainer':
      return `Explain why the fix for ${focus} is safe, what still looks uncertain, and how to validate it.${signalNote}`;
    case 'lead-answer':
      return `State the answer directly for ${focus} and keep it grounded in ${context.surfacePhrase}.${signalNote}`;
    case 'evidence-review':
      return `Support the answer for ${focus} with the strongest rationale from ${context.surfacePhrase}.${signalNote}`;
    case 'cross-check':
      return `Cross-check the main answer for ${focus} against competing interpretations in the supplied context.${signalNote}`;
    case 'clarity-pass':
      return `Rewrite the answer for ${focus} into concise, direct language without dropping important meaning.${signalNote}`;
    case 'limit-check':
      return `Call out where the answer for ${focus} could overreach or where the provided context runs out.${signalNote}`;
    case 'alternative-framing':
      return `State the strongest alternative framing of ${focus} Mercenary should compare before finalizing the answer.${signalNote}`;
    case 'boundary-check':
      return `State where claims about ${focus} clearly stop being supported by the prompt.${signalNote}`;
    case 'dependency-check':
      return `List hidden dependencies, unstated prerequisites, or implied conditions behind ${focus}.${signalNote}`;
    case 'ambiguity-check':
      return `Call out ambiguous phrases or unresolved interpretations that change how ${focus} should be read.${signalNote}`;
    case 'risk-review':
      return `Assume another provider gives the main answer for ${focus}. Focus on caveats, counterexamples, and sharp edges.${signalNote}`;
    case 'counterexample-hunt':
      return `State the strongest counterexamples or failure cases against the main answer for ${focus}.${signalNote}`;
    case 'abuse-case-review':
      return `State how a caller could misuse the answer for ${focus} or draw unsafe conclusions from it.${signalNote}`;
    case 'uncertainty-note':
      return `State the biggest unknowns Mercenary should preserve in the final answer for ${focus}.${signalNote}`;
    case 'action-plan':
      return `Focus on what the caller should do next about ${focus}, with concrete and low-risk steps.${signalNote}`;
    case 'validation-plan':
      return `State the shortest validation path for the recommended next step on ${focus}.${signalNote}`;
    case 'step-ordering':
      return `State the safest order in which the caller should execute the next steps on ${focus}.${signalNote}`;
    case 'fallback-plan':
      return `Describe what the caller should do if the first recommended action on ${focus} does not work.${signalNote}`;
    default:
      return `${fallback}${signalNote}`.trim();
  }
}
