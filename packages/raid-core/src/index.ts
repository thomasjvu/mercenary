import { createHash, randomUUID } from "node:crypto";
import {
  computeTrustScore,
  computePrivacyScore,
  computeReputationScore,
  providerHasErc8004Identity,
  providerHasPrivacyFeature,
  providerIsVeniceBacked,
  providerIsFresh,
} from "@bossraid/provider-registry";
import type {
  AssignmentRecord,
  BossRaidRoutingDecision,
  BossRaidRoutingProof,
  BossRaidSpawnInput,
  EvaluationBreakdown,
  PrivacyFeatureKey,
  ProviderProfile,
  RaidRecord,
  RaidContributionPlan,
  RaidTaskSpec,
  RankedSubmission,
  ReputationDelta,
  ReputationEvent,
  RewardComputation,
  RewardPolicy,
  SanitizationIssue,
  SanitizationReport,
  SanitizedTaskSpec,
  SelectedProviders,
  TaskFile,
} from "@bossraid/shared-types";

export const DEFAULT_TIMEOUTS = {
  inviteAcceptMs: 3_000,
  firstHeartbeatMs: 5_000,
  heartbeatStaleMs: 8_000,
  hardExecutionMs: 60_000,
  raidAbsoluteMs: 90_000,
  providerFreshMs: 60_000,
} as const;

export const DEFAULT_CAPABILITIES = {
  supportsLanguages: ["csharp", "typescript", "python", "solidity"],
  supportsEvalModes: ["build", "test", "lint", "llm_rubric"],
  maxExperts: 8,
  defaultTimeoutSec: 90,
} as const;

export const DEFAULT_LIMITS = {
  maxExperts: 5,
  maxFiles: 20,
  maxPayloadBytes: 250_000,
  maxDiffLines: 300,
  maxLoc: 50_000,
  validThreshold: 0.55,
  duplicateSimilarityThreshold: 0.92,
} as const;

const SECRET_PATTERNS = [
  /sk-[a-z0-9-]{12,}/gi,
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z-_]{20,}/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /eyJ[A-Za-z0-9_\-=]+?\.[A-Za-z0-9_\-=]+\.?[A-Za-z0-9_\-./+=]*/g,
];

const IDENTIFIER_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /https?:\/\/[^\s)"']+/gi,
  /\/Users\/[^\s/"']+/g,
  /C:\\Users\\[^\s\\"']+/g,
];

export const ReputationDeltas = {
  valid_submission: { global: 0.01, validity: 0.02, quality: 0.01 },
  successful_provider: { global: 0.02, quality: 0.03 },
  invite_timeout: { global: -0.01, responsiveness: -0.03 },
  heartbeat_timeout: { global: -0.02, responsiveness: -0.05 },
  invalid_submission: { global: -0.015, validity: -0.03 },
  duplicate_submission: { global: -0.03, quality: -0.02 },
  security_violation: { global: -0.25 },
} as const satisfies Record<string, ReputationDelta>;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

export function scoreSpecialization(provider: ProviderProfile, task: RaidTaskSpec): number {
  const required = new Set(task.constraints.requireSpecializations.map((item) => item.toLowerCase()));
  const isPatchTask = (task.output?.primaryType ?? "patch") === "patch";

  if (isPatchTask && task.framework) {
    required.add(String(task.framework).toLowerCase());
  }

  if (isPatchTask && task.language !== "text") {
    required.add(task.language.toLowerCase());
  }

  const offered = new Set([
    ...provider.specializations.map((item) => item.toLowerCase()),
    ...provider.supportedFrameworks.map((item) => item.toLowerCase()),
    ...provider.supportedLanguages.map((item) => item.toLowerCase()),
  ]);

  if (required.size === 0) {
    return 1;
  }

  let matches = 0;
  for (const item of required) {
    if (offered.has(item)) {
      matches += 1;
    }
  }

  return matches / required.size;
}

type TextDomainCategory = "implementation" | "art" | "promo";

const TEXT_DOMAIN_SIGNAL_RULES: Array<{
  category: TextDomainCategory;
  weight: number;
  patterns: RegExp[];
}> = [
  {
    category: "implementation",
    weight: 4,
    patterns: [/\bgb[\s-]?studio\b/i, /\bplayable\b/i, /\bmicrogame\b/i],
  },
  {
    category: "implementation",
    weight: 3,
    patterns: [/\bgameplay\b/i, /\bscene\b/i, /\bmechanic\b/i, /\bbuild\b/i, /\bimplement\b/i],
  },
  {
    category: "art",
    weight: 3,
    patterns: [/\bpixel[\s-]?art\b/i, /\bsprite\b/i, /\btileset\b/i, /\btitle card\b/i],
  },
  {
    category: "art",
    weight: 2,
    patterns: [/\bpalette\b/i, /\basset pack\b/i, /\bart pack\b/i, /\bvisual\b/i],
  },
  {
    category: "promo",
    weight: 4,
    patterns: [/\btrailer\b/i, /\bteaser\b/i, /\bremotion\b/i],
  },
  {
    category: "promo",
    weight: 2,
    patterns: [/\blaunch copy\b/i, /\bmarketing\b/i, /\bpromo\b/i, /\bvideo\b/i],
  },
];

const TEXT_DOMAIN_PROVIDER_HINTS: Record<TextDomainCategory, string[]> = {
  implementation: [
    "gb-studio",
    "gbstudio",
    "gameplay",
    "game-development",
    "systems-design",
    "implementation",
    "builder",
  ],
  art: [
    "pixel-art",
    "pixel-artist",
    "sprites",
    "sprite",
    "tileset",
    "title-card",
    "illustration",
    "art",
  ],
  promo: [
    "remotion",
    "video-marketing",
    "video-marketer",
    "game-marketing",
    "trailer",
    "launch-copy",
    "marketing",
    "motion-design",
  ],
};

function normalizeCapabilityToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
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
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
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

function providerMatchesTextDomainCategory(
  provider: ProviderProfile,
  category: TextDomainCategory,
): boolean {
  const offered = new Set(
    [
      ...provider.specializations,
      ...provider.supportedFrameworks,
      ...provider.supportedLanguages,
    ].map(normalizeCapabilityToken),
  );

  return TEXT_DOMAIN_PROVIDER_HINTS[category].some((hint) => offered.has(hint));
}

function scoreTextDomainFit(provider: ProviderProfile, task: RaidTaskSpec): number {
  if ((task.output?.primaryType ?? "patch") !== "text") {
    return 0.5;
  }

  const weights = collectTextDomainWeights(task);
  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0);
  if (totalWeight === 0) {
    return 0.5;
  }

  let matchedWeight = 0;
  for (const [category, weight] of weights) {
    if (providerMatchesTextDomainCategory(provider, category)) {
      matchedWeight += weight;
    }
  }

  return clamp01(matchedWeight / totalWeight);
}

export function normalizeLatency(p95LatencyMs: number, maxLatencySec: number): number {
  const budgetedMs = Math.max(maxLatencySec * 1_000, 1);
  return clamp01(1 - p95LatencyMs / (budgetedMs * 1.5));
}

export function normalizePrice(pricePerTaskUsd: number, maxBudgetUsd: number, numExperts: number): number {
  const perExpertBudget = maxBudgetUsd / Math.max(numExperts, 1);
  return clamp01(1 - pricePerTaskUsd / Math.max(perExpertBudget, 0.01));
}

export function computeSelectionScore(provider: ProviderProfile, task: RaidTaskSpec): number {
  const specializationMatch = scoreSpecialization(provider, task);
  const textDomainFit = scoreTextDomainFit(provider, task);
  const reputation = (provider.scores?.reputationScore ?? computeReputationScore(provider)) / 100;
  const latency = normalizeLatency(provider.reputation.p95LatencyMs, task.constraints.maxLatencySec);
  const validity = provider.reputation.validityScore;
  const price = normalizePrice(
    provider.pricePerTaskUsd,
    task.constraints.maxBudgetUsd,
    task.constraints.numExperts,
  );

  if ((task.output?.primaryType ?? "patch") === "text") {
    return (
      0.2 * specializationMatch +
      0.3 * textDomainFit +
      0.2 * reputation +
      0.15 * latency +
      0.1 * validity +
      0.05 * price
    );
  }

  return (
    0.35 * specializationMatch +
    0.2 * reputation +
    0.2 * latency +
    0.15 * validity +
    0.1 * price
  );
}

function normalizeModelFamily(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function providerMatchesAllowedModelFamilies(
  provider: ProviderProfile,
  allowedFamilies: string[] | undefined,
): boolean {
  if (!allowedFamilies?.length) {
    return true;
  }

  const providerFamily = normalizeModelFamily(provider.modelFamily);
  return providerFamily.length > 0 && allowedFamilies.some((family) => normalizeModelFamily(family) === providerFamily);
}

function taskUsesVenicePrivateLane(task: RaidTaskSpec): boolean {
  return (
    task.constraints.privacyMode === "strict" ||
    (task.constraints.allowedModelFamilies ?? []).some((family) => normalizeModelFamily(family).includes("venice"))
  );
}

function readProviderPrivacyFeatures(provider: ProviderProfile): PrivacyFeatureKey[] {
  const features: PrivacyFeatureKey[] = [];

  if (provider.privacy?.teeAttested) {
    features.push("tee_attested");
  }
  if (provider.privacy?.e2ee) {
    features.push("e2ee");
  }
  if (provider.privacy?.noDataRetention) {
    features.push("no_data_retention");
  }
  if (provider.privacy?.signedOutputs) {
    features.push("signed_outputs");
  }
  if (provider.privacy?.provenanceAttested) {
    features.push("provenance_attested");
  }
  if (provider.privacy?.operatorVerified) {
    features.push("operator_verified");
  }

  return features;
}

function collectMatchedSpecializations(provider: ProviderProfile, task: RaidTaskSpec): string[] {
  const required = new Set(task.constraints.requireSpecializations.map((item) => item.toLowerCase()));

  if ((task.output?.primaryType ?? "patch") === "patch" && task.framework) {
    required.add(String(task.framework).toLowerCase());
  }

  if ((task.output?.primaryType ?? "patch") === "patch" && task.language !== "text") {
    required.add(task.language.toLowerCase());
  }

  if (required.size === 0) {
    return [];
  }

  const offered = new Set([
    ...provider.specializations.map((item) => item.toLowerCase()),
    ...provider.supportedFrameworks.map((item) => item.toLowerCase()),
    ...provider.supportedLanguages.map((item) => item.toLowerCase()),
  ]);

  return [...required].filter((item) => offered.has(item));
}

function buildRoutingDecision(
  task: RaidTaskSpec,
  provider: ProviderProfile,
  phase: "primary" | "reserve",
): BossRaidRoutingDecision {
  const trustScore = computeTrustScore(provider);
  const trustAwareRouting =
    task.constraints.requireErc8004 === true ||
    typeof task.constraints.minTrustScore === "number";
  const veniceBacked = providerIsVeniceBacked(provider);
  const requiredPrivacyFeatures = task.constraints.requirePrivacyFeatures ?? [];
  const verification = provider.erc8004?.verification;
  const privacyFeatureMatch =
    requiredPrivacyFeatures.length === 0 ||
    requiredPrivacyFeatures.every((feature) => providerHasPrivacyFeature(provider, feature));
  const reasons = [
    phase === "primary" ? "selected_primary" : "reserved_fallback",
    task.constraints.privacyMode === "strict"
      ? "strict_privacy"
      : task.constraints.privacyMode === "prefer"
        ? "privacy_requested"
        : "standard_routing",
    taskUsesVenicePrivateLane(task)
      ? veniceBacked
        ? "venice_private_lane"
        : "venice_fallback"
      : null,
    providerMatchesAllowedModelFamilies(provider, task.constraints.allowedModelFamilies) &&
    (task.constraints.allowedModelFamilies?.length ?? 0) > 0
      ? "allowed_model_family"
      : null,
    privacyFeatureMatch && requiredPrivacyFeatures.length > 0 ? "required_privacy_features" : null,
    task.constraints.requireErc8004 === true && providerHasErc8004Identity(provider) ? "erc8004_required" : null,
    typeof task.constraints.minTrustScore === "number" && trustScore >= task.constraints.minTrustScore
      ? "trust_threshold_met"
      : null,
    trustAwareRouting && trustScore > 0 ? "trust_ranked" : null,
    collectMatchedSpecializations(provider, task).length > 0 ? "specialization_match" : null,
  ].filter((value): value is string => value != null);

  return {
    providerId: provider.providerId,
    phase,
    modelFamily: provider.modelFamily,
    veniceBacked,
    erc8004Registered: providerHasErc8004Identity(provider),
    trustScore,
    trustReason: provider.trust?.reason,
    operatorWallet: provider.erc8004?.operatorWallet,
    registrationTx: provider.erc8004?.registrationTx,
    erc8004VerificationStatus: verification?.status,
    erc8004VerificationCheckedAt: verification?.checkedAt,
    agentRegistry: verification?.agentRegistry ?? provider.erc8004?.identityRegistry,
    agentUri: verification?.agentUri,
    registrationTxFound: verification?.registrationTxFound,
    operatorMatchesOwner: verification?.operatorMatchesOwner,
    privacyFeatures: readProviderPrivacyFeatures(provider),
    matchedSpecializations: collectMatchedSpecializations(provider, task),
    reasons,
  };
}

export function buildRoutingProof(
  task: RaidTaskSpec,
  selectedProviders: SelectedProviders,
): BossRaidRoutingProof {
  return {
    policy: {
      privacyMode: task.constraints.privacyMode ?? "off",
      selectionMode:
        task.constraints.selectionMode ??
        (task.constraints.privacyMode && task.constraints.privacyMode !== "off" ? "privacy_first" : "best_match"),
      requireErc8004: task.constraints.requireErc8004 === true,
      minTrustScore: task.constraints.minTrustScore,
      allowedModelFamilies: task.constraints.allowedModelFamilies ?? [],
      requiredPrivacyFeatures: task.constraints.requirePrivacyFeatures ?? [],
      venicePrivateLane: taskUsesVenicePrivateLane(task),
    },
    providers: [
      ...selectedProviders.primaries.map((provider) => buildRoutingDecision(task, provider, "primary")),
      ...selectedProviders.reserves.map((provider) => buildRoutingDecision(task, provider, "reserve")),
    ],
  };
}

export function annotateRoutingProof(
  routingProof: BossRaidRoutingProof,
  contributionPlan: RaidContributionPlan | undefined,
): BossRaidRoutingProof {
  if (!contributionPlan) {
    return routingProof;
  }

  return {
    ...routingProof,
    providers: routingProof.providers.map((decision) => ({
      ...decision,
      workstreamId: contributionPlan.workstreamId,
      workstreamLabel: contributionPlan.workstreamLabel,
      roleId: contributionPlan.roleId,
      roleLabel: contributionPlan.roleLabel,
      reasons: decision.reasons.includes("workstream_scoped")
        ? decision.reasons
        : [...decision.reasons, "workstream_scoped"],
    })),
  };
}

export function providerMatchesTask(
  provider: ProviderProfile,
  task: RaidTaskSpec,
  maxHeartbeatAgeMs: number = DEFAULT_TIMEOUTS.providerFreshMs,
): boolean {
  const isPatchTask = (task.output?.primaryType ?? "patch") === "patch";
  const requestedPrimaryOutputType = task.output?.primaryType;
  const frameworkMatch =
    !isPatchTask ||
    !task.framework ||
    provider.supportedFrameworks
      .map((item) => item.toLowerCase())
      .includes(String(task.framework).toLowerCase());

  const languageMatch =
    !isPatchTask ||
    task.language === "text" ||
    provider.supportedLanguages.includes(task.language);
  const reputationMatch =
    (provider.scores?.reputationScore ?? computeReputationScore(provider)) / 100 >= task.constraints.minReputation;
  const timeoutMatch = provider.reputation.timeoutRate <= 0.25;
  const priceMatch =
    provider.pricePerTaskUsd * Math.max(task.constraints.numExperts, 1) <= task.constraints.maxBudgetUsd;
  const modelFamilyMatch =
    providerMatchesAllowedModelFamilies(provider, task.constraints.allowedModelFamilies);
  const primaryOutputMatch =
    requestedPrimaryOutputType == null || provider.outputTypes?.includes(requestedPrimaryOutputType) === true;
  const outputTypeMatch =
    !task.constraints.allowedOutputTypes?.length ||
    task.constraints.allowedOutputTypes.some((outputType) => provider.outputTypes?.includes(outputType));
  const erc8004Match =
    task.constraints.requireErc8004 !== true || providerHasErc8004Identity(provider);
  const trustScore = computeTrustScore(provider);
  const trustMatch =
    typeof task.constraints.minTrustScore !== "number" || trustScore >= task.constraints.minTrustScore;
  const strictPrivacyMatch =
    task.constraints.privacyMode !== "strict" ||
    (task.constraints.requirePrivacyFeatures ?? []).every((feature) => providerHasPrivacyFeature(provider, feature));
  const freshMatch = providerIsFresh(provider, maxHeartbeatAgeMs);

  return (
    languageMatch &&
    frameworkMatch &&
    reputationMatch &&
    timeoutMatch &&
    priceMatch &&
    modelFamilyMatch &&
    primaryOutputMatch &&
    outputTypeMatch &&
    erc8004Match &&
    trustMatch &&
    strictPrivacyMatch &&
    freshMatch
  );
}

export function selectProviders(
  task: RaidTaskSpec,
  providers: ProviderProfile[],
  maxHeartbeatAgeMs: number = DEFAULT_TIMEOUTS.providerFreshMs,
): SelectedProviders {
  const eligible = providers
    .filter((provider) => providerMatchesTask(provider, task, maxHeartbeatAgeMs))
    .map((provider) => ({
      provider,
      selectionScore: computeSelectionScore(provider, task),
      privacyScore: computePrivacyScore(provider.privacy),
    }));
  const veniceEligible = taskUsesVenicePrivateLane(task)
    ? eligible.filter((item) => providerIsVeniceBacked(item.provider))
    : [];
  const routingPool = veniceEligible.length > 0 ? veniceEligible : eligible;
  const ranked = routingPool
    .sort((left, right) => compareProviders(left, right, task));

  const selected =
    task.constraints.selectionMode === "diverse_mix"
      ? selectDiverseProviders(ranked, task.constraints.numExperts)
      : ranked.slice(0, task.constraints.numExperts);

  const primaries = selected.map((item) => item.provider);
  const reserveCount = primaries.length > 0 ? 1 : 0;
  const reserves = ranked
    .filter((item) => !primaries.some((provider) => provider.providerId === item.provider.providerId))
    .slice(0, reserveCount)
    .map((item) => item.provider);

  return { primaries, reserves };
}

function compareProviders(
  left: { provider: ProviderProfile; selectionScore: number; privacyScore: number },
  right: { provider: ProviderProfile; selectionScore: number; privacyScore: number },
  task: RaidTaskSpec,
): number {
  const mode =
    task.constraints.selectionMode ??
    (task.constraints.privacyMode && task.constraints.privacyMode !== "off" ? "privacy_first" : "best_match");
  const leftTrustScore = computeTrustScore(left.provider);
  const rightTrustScore = computeTrustScore(right.provider);
  const leftVenice = providerIsVeniceBacked(left.provider);
  const rightVenice = providerIsVeniceBacked(right.provider);
  const trustAwareRouting =
    task.constraints.requireErc8004 === true ||
    typeof task.constraints.minTrustScore === "number";
  const venicePrivateLane = taskUsesVenicePrivateLane(task);

  if (mode === "cost_first" && left.provider.pricePerTaskUsd !== right.provider.pricePerTaskUsd) {
    return left.provider.pricePerTaskUsd - right.provider.pricePerTaskUsd;
  }

  if (venicePrivateLane && leftVenice !== rightVenice) {
    return Number(rightVenice) - Number(leftVenice);
  }

  if (trustAwareRouting && rightTrustScore !== leftTrustScore) {
    return rightTrustScore - leftTrustScore;
  }

  if (mode === "privacy_first" && left.privacyScore !== right.privacyScore) {
    return right.privacyScore - left.privacyScore;
  }

  if (right.selectionScore !== left.selectionScore) {
    return right.selectionScore - left.selectionScore;
  }

  return right.privacyScore - left.privacyScore;
}

function selectDiverseProviders(
  eligible: Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }>,
  maxProviders: number,
): Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }> {
  const selected: Array<{ provider: ProviderProfile; selectionScore: number; privacyScore: number }> = [];
  const usedFamilies = new Set<string>();

  for (const item of eligible) {
    const family = item.provider.modelFamily ?? item.provider.providerId;
    if (usedFamilies.has(family)) {
      continue;
    }
    selected.push(item);
    usedFamilies.add(family);
    if (selected.length >= maxProviders) {
      return selected;
    }
  }

  for (const item of eligible) {
    if (selected.some((selectedItem) => selectedItem.provider.providerId === item.provider.providerId)) {
      continue;
    }
    selected.push(item);
    if (selected.length >= maxProviders) {
      return selected;
    }
  }

  return selected;
}

export function createAssignmentRecords(selectedProviders: SelectedProviders): Record<string, AssignmentRecord> {
  const assignments: Record<string, AssignmentRecord> = {};
  const now = new Date().toISOString();

  for (const provider of selectedProviders.primaries) {
    assignments[provider.providerId] = {
      providerId: provider.providerId,
      status: "selected",
      invitedAt: now,
      progress: 0,
    };
  }

  for (const provider of selectedProviders.reserves) {
    assignments[provider.providerId] = {
      providerId: provider.providerId,
      status: "selected",
      invitedAt: now,
      progress: 0,
      message: "reserve",
    };
  }

  return assignments;
}

function replaceAllMatches(
  input: string,
  patterns: RegExp[],
  replacement: string,
): { text: string; replacements: number } {
  let replacements = 0;
  let text = input;

  for (const pattern of patterns) {
    text = text.replace(pattern, () => {
      replacements += 1;
      return replacement;
    });
  }

  return { text, replacements };
}

function trimLargeContent(content: string, maxLines = 300): { content: string; trimmed: boolean } {
  const lines = content.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { content, trimmed: false };
  }

  const head = lines.slice(0, Math.ceil(maxLines * 0.6));
  const tail = lines.slice(-Math.floor(maxLines * 0.25));
  return {
    content: [...head, "... [redacted middle section] ...", ...tail].join("\n"),
    trimmed: true,
  };
}

function sanitizeFile(file: TaskFile, redactIdentifiers: boolean): {
  file: TaskFile;
  secretCount: number;
  identifierCount: number;
  urlCount: number;
  trimmed: boolean;
} {
  const secretResult = replaceAllMatches(file.content, SECRET_PATTERNS, "[REDACTED_SECRET]");
  let content = secretResult.text;
  let identifierCount = 0;
  let urlCount = 0;

  if (redactIdentifiers) {
    const before = content;
    const identifierResult = replaceAllMatches(content, IDENTIFIER_PATTERNS, "[REDACTED_IDENTIFIER]");
    content = identifierResult.text;
    identifierCount = identifierResult.replacements;
    urlCount = (before.match(/https?:\/\/[^\s)"']+/gi) ?? []).length;
  }

  const trimmedResult = trimLargeContent(content);

  return {
    file: {
      ...file,
      content: trimmedResult.content,
      sha256: sha256(trimmedResult.content),
    },
    secretCount: secretResult.replacements,
    identifierCount,
    urlCount,
    trimmed: trimmedResult.trimmed,
  };
}

export function sanitizeTask(input: BossRaidSpawnInput): SanitizedTaskSpec {
  const issues: SanitizationIssue[] = [];
  const originalBytes = input.files.reduce((sum, file) => sum + file.content.length, 0);
  const sanitizedFiles = input.files
    .slice(0, DEFAULT_LIMITS.maxFiles)
    .map((file) => sanitizeFile(file, input.privacyMode.redactIdentifiers));

  const redactedSecrets = sanitizedFiles.reduce((sum, item) => sum + item.secretCount, 0);
  const redactedIdentifiers = sanitizedFiles.reduce((sum, item) => sum + item.identifierCount, 0);
  const removedUrls = sanitizedFiles.reduce((sum, item) => sum + item.urlCount, 0);
  const trimmedFiles = sanitizedFiles.filter((item) => item.trimmed).length;

  if (input.files.length > DEFAULT_LIMITS.maxFiles) {
    issues.push({
      severity: "warn",
      code: "too_many_files",
      message: `Trimmed payload to ${DEFAULT_LIMITS.maxFiles} files.`,
    });
  }

  if (originalBytes > DEFAULT_LIMITS.maxPayloadBytes) {
    issues.push({
      severity: "warn",
      code: "payload_large",
      message: "Original payload exceeded the preferred byte budget.",
    });
  }

  if (input.constraints.allowExternalSearch) {
    issues.push({
      severity: "warn",
      code: "external_search_requested",
      message: "Provider execution should stay offline for the hackathon MVP.",
    });
  }

  const unsafeContentDetected = redactedSecrets > 0 || originalBytes > DEFAULT_LIMITS.maxPayloadBytes;
  const riskTier =
    unsafeContentDetected || input.files.length > DEFAULT_LIMITS.maxFiles
      ? "unsafe"
      : input.framework === "unity" || input.failingSignals.errors.length > 0
        ? "medium"
        : "safe";

  const report: SanitizationReport = {
    redactedSecrets,
    redactedIdentifiers,
    removedUrls,
    trimmedFiles,
    unsafeContentDetected,
    riskTier,
    issues,
  };

  return {
    ...input,
    files: sanitizedFiles.map((item) => item.file),
    taskDescription: sanitizeFreeformText(input.taskDescription),
    failingSignals: sanitizeFailingSignals(input.failingSignals),
    originalFileCount: input.files.length,
    originalBytes,
    sanitizationReport: report,
  };
}

export function sanitizeFreeformText(input: string): string {
  const secretRedacted = replaceAllMatches(input, SECRET_PATTERNS, "[REDACTED_SECRET]");
  const identifierRedacted = replaceAllMatches(
    secretRedacted.text,
    IDENTIFIER_PATTERNS,
    "[REDACTED_IDENTIFIER]",
  );

  return identifierRedacted.text;
}

export function sanitizeFailingSignals<T extends { errors: string[]; tests?: string[]; reproSteps?: string[] }>(
  input: T,
): T {
  return {
    ...input,
    errors: input.errors.map((item) => sanitizeFreeformText(item)),
    tests: input.tests?.map((item) => sanitizeFreeformText(item)),
    reproSteps: input.reproSteps?.map((item) => sanitizeFreeformText(item)),
  };
}

export function createRaidRecord(
  input: SanitizedTaskSpec,
  selectedProviders: SelectedProviders,
  options: {
    deadlineUnix?: number;
  } = {},
): RaidRecord {
  const now = new Date().toISOString();
  const raidId = `raid_${randomUUID()}`;
  const deadlineUnix =
    options.deadlineUnix ?? Math.ceil((Date.now() + input.constraints.maxLatencySec * 1_000) / 1_000);

  return {
    id: raidId,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    deadlineUnix,
    task: input,
    selectedProviders: selectedProviders.primaries.map((provider) => provider.providerId),
    reserveProviders: selectedProviders.reserves.map((provider) => provider.providerId),
    routingProof: buildRoutingProof(input, selectedProviders),
    assignments: createAssignmentRecords(selectedProviders),
    rankedSubmissions: [],
    reputationEvents: [],
  };
}

export function rankSubmissions(submissions: RankedSubmission[]): RankedSubmission[] {
  return [...submissions]
    .sort((left, right) => {
      if (right.breakdown.finalScore !== left.breakdown.finalScore) {
        return right.breakdown.finalScore - left.breakdown.finalScore;
      }

      if (right.breakdown.testScore !== left.breakdown.testScore) {
        return right.breakdown.testScore - left.breakdown.testScore;
      }

      if (left.breakdown.sideEffectSafety !== right.breakdown.sideEffectSafety) {
        return right.breakdown.sideEffectSafety - left.breakdown.sideEffectSafety;
      }

      const leftSize = summarizeSubmissionContent(left.submission).length;
      const rightSize = summarizeSubmissionContent(right.submission).length;
      return leftSize - rightSize;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function summarizeSubmissionContent(submission: RankedSubmission["submission"]): string {
  if (submission.patchUnifiedDiff) {
    return submission.patchUnifiedDiff;
  }

  if (submission.answerText) {
    return submission.answerText;
  }

  return (submission.artifacts ?? [])
    .map((artifact) => [artifact.outputType, artifact.label, artifact.description, artifact.mimeType].filter(Boolean).join(" "))
    .join("\n");
}

export function computeRewards(
  totalBudget: number,
  ranked: RankedSubmission[],
  _rewardPolicy: RewardPolicy,
): RewardComputation {
  const successfulProviders = ranked.filter((item) => item.breakdown.valid);
  const payoutPerSuccessfulProvider =
    successfulProviders.length > 0 ? totalBudget / successfulProviders.length : 0;

  return {
    successfulProviderCount: successfulProviders.length,
    payoutPerSuccessfulProvider,
    successfulProvidersPaid: payoutPerSuccessfulProvider * successfulProviders.length,
  };
}

export function applyReputationDelta(current: number, delta = 0): number {
  return clamp01(current + delta);
}

export function createReputationEvent(
  providerId: string,
  type: keyof typeof ReputationDeltas,
  context?: Record<string, unknown>,
): ReputationEvent {
  return {
    providerId,
    type,
    delta: ReputationDeltas[type],
    timestamp: new Date().toISOString(),
    context,
  };
}

export function hashSubmission(primaryContent: string, explanation: string): string {
  return sha256(`${primaryContent}\n---\n${explanation}`);
}

export function estimateLatencyScore(elapsedMs: number, maxLatencySec: number): number {
  return clamp01(1 - elapsedMs / Math.max(maxLatencySec * 1_000, 1));
}

export function summarizeBreakdown(breakdown: EvaluationBreakdown): string {
  if (!breakdown.valid) {
    return `invalid: ${breakdown.invalidReasons.join(", ")}`;
  }

  return `valid score=${breakdown.finalScore.toFixed(3)} build=${breakdown.buildScore.toFixed(2)} test=${breakdown.testScore.toFixed(2)}`;
}
