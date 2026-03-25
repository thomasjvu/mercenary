import type {
  BossRaidSynthesizedOutput,
  BossRaidSynthesizedWorkstream,
  OutputType,
  RaidRecord,
  RankedSubmission,
  SubmissionArtifact,
} from "@bossraid/shared-types";

const MAX_SUPPORTING_SIGNALS = 4;
const PATCH_WORKSTREAM_ORDER = ["gameplay", "pixel-art", "video-marketing", "implementation", "diagnosis", "verification", "delivery"] as const;
const TEXT_WORKSTREAM_ORDER = ["answer", "constraints", "risk", "execution"] as const;

type WorkstreamGroup = {
  id: string;
  label: string;
  objective: string;
  entries: RankedSubmission[];
};

export function buildSynthesizedOutput(raid: RaidRecord): BossRaidSynthesizedOutput | undefined {
  const approved = raid.rankedSubmissions.filter((item) => item.breakdown.valid);
  if (approved.length === 0) {
    return undefined;
  }

  const droppedProviderIds = raid.rankedSubmissions
    .filter((item) => !item.breakdown.valid)
    .map((item) => item.submission.providerId);
  const primaryType = raid.task.output?.primaryType ?? "patch";
  const workstreams = buildWorkstreams(primaryType, approved);

  return primaryType === "patch"
    ? buildPatchSynthesis(primaryType, approved, droppedProviderIds, workstreams)
    : buildTextSynthesis(primaryType, approved, droppedProviderIds, workstreams);
}

function buildTextSynthesis(
  primaryType: OutputType,
  approved: RankedSubmission[],
  droppedProviderIds: string[],
  workstreams: BossRaidSynthesizedWorkstream[],
): BossRaidSynthesizedOutput {
  const baseWorkstream = selectBaseWorkstream(primaryType, workstreams);
  const supportingWorkstreams = workstreams.filter((item) => item.id !== baseWorkstream.id);
  const baseProviderId = baseWorkstream.baseSubmissionProviderId;
  const supportingProviderIds = approved
    .map((item) => item.submission.providerId)
    .filter((providerId) => providerId !== baseProviderId);
  const answerText = buildCanonicalTextAnswer(baseWorkstream, supportingWorkstreams);

  return {
    mode: "multi_agent_synthesis",
    primaryType,
    answerText,
    artifacts: collectArtifactsFromWorkstreams(workstreams),
    explanation: buildSynthesisProofSummary("response", approved.length, workstreams.length, baseWorkstream.label, baseProviderId, droppedProviderIds),
    baseSubmissionProviderId: baseProviderId,
    contributingProviderIds: approved.map((item) => item.submission.providerId),
    supportingProviderIds,
    droppedProviderIds,
    contributions: approved.map((item) => ({
      providerId: item.submission.providerId,
      rank: item.rank,
      finalScore: item.breakdown.finalScore,
      roleId: item.submission.contributionRole?.id,
      roleLabel: item.submission.contributionRole?.label,
      workstreamId: item.submission.contributionRole?.workstreamId,
      workstreamLabel: item.submission.contributionRole?.workstreamLabel,
    })),
    workstreams,
  };
}

function buildPatchSynthesis(
  primaryType: OutputType,
  approved: RankedSubmission[],
  droppedProviderIds: string[],
  workstreams: BossRaidSynthesizedWorkstream[],
): BossRaidSynthesizedOutput {
  const baseWorkstream = selectBaseWorkstream(primaryType, workstreams);
  const baseProviderId = baseWorkstream.baseSubmissionProviderId;
  const supportingWorkstreams = workstreams.filter((item) => item.id !== baseWorkstream.id);
  const supportingProviderIds = approved
    .map((item) => item.submission.providerId)
    .filter((providerId) => providerId !== baseProviderId);

  return {
    mode: "multi_agent_synthesis",
    primaryType,
    patchUnifiedDiff:
      baseWorkstream.patchUnifiedDiff ??
      approved.find((item) => hasPatch(item.submission.patchUnifiedDiff))?.submission.patchUnifiedDiff,
    artifacts: collectArtifactsFromWorkstreams(workstreams),
    explanation: [
      buildSynthesisProofSummary("patch", approved.length, workstreams.length, baseWorkstream.label, baseProviderId, droppedProviderIds),
      supportingWorkstreams.length > 0
        ? supportingWorkstreams.map((item) => `${item.label}: ${item.shortSummary ?? item.summary}`).join(" ")
        : undefined,
    ].filter(Boolean).join(" "),
    baseSubmissionProviderId: baseProviderId,
    contributingProviderIds: approved.map((item) => item.submission.providerId),
    supportingProviderIds,
    droppedProviderIds,
    contributions: approved.map((item) => ({
      providerId: item.submission.providerId,
      rank: item.rank,
      finalScore: item.breakdown.finalScore,
      roleId: item.submission.contributionRole?.id,
      roleLabel: item.submission.contributionRole?.label,
      workstreamId: item.submission.contributionRole?.workstreamId,
      workstreamLabel: item.submission.contributionRole?.workstreamLabel,
    })),
    workstreams,
  };
}

function buildWorkstreams(
  primaryType: OutputType,
  approved: RankedSubmission[],
): BossRaidSynthesizedWorkstream[] {
  const groups = new Map<string, WorkstreamGroup>();

  for (const entry of approved) {
    const metadata = getWorkstreamMetadata(entry);
    const current = groups.get(metadata.id);
    if (current) {
      current.entries.push(entry);
      continue;
    }

    groups.set(metadata.id, {
      ...metadata,
      entries: [entry],
    });
  }

  return [...groups.values()]
    .sort((left, right) => compareWorkstreams(primaryType, left, right))
    .map((group) => buildWorkstream(primaryType, group));
}

function buildWorkstream(
  primaryType: OutputType,
  group: WorkstreamGroup,
): BossRaidSynthesizedWorkstream {
  const workstreamPrimaryType = selectWorkstreamPrimaryType(primaryType, group.entries);
  const base =
    workstreamPrimaryType === "patch"
      ? group.entries.find((item) => hasPatch(item.submission.patchUnifiedDiff)) ?? group.entries[0]!
      : group.entries[0]!;
  const supportingEntries = group.entries.filter((item) => item !== base);
  const baseText =
    workstreamPrimaryType === "patch"
      ? cleanText(base.submission.explanation)
      : cleanText(base.submission.answerText ?? base.submission.explanation);
  const artifacts = mergeArtifacts(group.entries);
  const artifactSummary = summarizeArtifactLabels(artifacts);
  const supportingSignals = collectSupportingSignals(base, supportingEntries);
  const shortSummary = buildWorkstreamShortSummary(baseText);
  const summary =
    supportingSignals.length === 0 && !artifactSummary
      ? shortSummary
      : [
          shortSummary,
          artifactSummary ? `Artifacts: ${artifactSummary}.` : undefined,
          supportingSignals.length > 0 ? `Supporting signals: ${supportingSignals.join(" | ")}` : undefined,
        ]
          .filter(Boolean)
          .join(" ");

  return {
    id: group.id,
    label: group.label,
    objective: group.objective,
    primaryType: workstreamPrimaryType,
    baseSubmissionProviderId: base.submission.providerId,
    contributingProviderIds: group.entries.map((item) => item.submission.providerId),
    supportingProviderIds: supportingEntries.map((item) => item.submission.providerId),
    roleLabels: unique(
      group.entries
        .map((item) => item.submission.contributionRole?.label)
        .filter((value): value is string => Boolean(value)),
    ),
    summary,
    shortSummary,
    answerText: workstreamPrimaryType === "patch" ? undefined : baseText,
    patchUnifiedDiff: workstreamPrimaryType === "patch" ? base.submission.patchUnifiedDiff : undefined,
    artifacts,
  };
}

function buildCanonicalTextAnswer(
  baseWorkstream: BossRaidSynthesizedWorkstream,
  supportingWorkstreams: BossRaidSynthesizedWorkstream[],
): string {
  const paragraphs: string[] = [];
  const baseNarrative = pickWorkstreamNarrative(baseWorkstream);
  if (baseNarrative) {
    paragraphs.push(baseNarrative);
  }

  const constraint = findGroupedWorkstream(supportingWorkstreams, "constraints");
  const risk = findGroupedWorkstream(supportingWorkstreams, "risk");
  const execution = findGroupedWorkstream(supportingWorkstreams, "execution");
  const groupedIds = new Set([constraint?.id, risk?.id, execution?.id].filter((value): value is string => Boolean(value)));
  const cautionParagraph = [constraint, risk]
    .flatMap((workstream) => {
      const narrative = workstream ? pickWorkstreamNarrative(workstream) : undefined;
      return narrative ? [ensureSentence(narrative)] : [];
    })
    .join(" ");
  if (cautionParagraph) {
    paragraphs.push(cautionParagraph);
  }

  const executionNarrative = execution ? pickWorkstreamNarrative(execution) : undefined;
  if (executionNarrative) {
    paragraphs.push(ensureSentence(executionNarrative));
  }

  const remaining = supportingWorkstreams
    .filter((workstream) => !groupedIds.has(workstream.id))
    .flatMap((workstream) => {
      const narrative = pickWorkstreamNarrative(workstream);
      return narrative ? [ensureSentence(narrative)] : [];
    })
    .join(" ");
  if (remaining) {
    paragraphs.push(remaining);
  }

  return paragraphs.filter((value) => value.length > 0).join("\n\n");
}

function buildSynthesisProofSummary(
  outputKind: "response" | "patch",
  approvedCount: number,
  workstreamCount: number,
  baseWorkstreamLabel: string,
  baseProviderId: string,
  droppedProviderIds: string[],
): string {
  return [
    `Mercenary synthesized ${approvedCount} approved provider contributions across ${workstreamCount} workstreams into one ${outputKind}.`,
    `Base ${outputKind === "patch" ? "workstream" : "answer"}: ${baseWorkstreamLabel} via ${baseProviderId}.`,
    droppedProviderIds.length > 0
      ? `Dropped ${droppedProviderIds.length} invalid provider output${droppedProviderIds.length === 1 ? "" : "s"}.`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function findGroupedWorkstream(
  workstreams: BossRaidSynthesizedWorkstream[],
  group: string,
): BossRaidSynthesizedWorkstream | undefined {
  return workstreams.find((workstream) => matchesWorkstreamGroup(workstream.id, group));
}

function pickWorkstreamNarrative(workstream: BossRaidSynthesizedWorkstream): string {
  return cleanText(workstream.answerText ?? workstream.shortSummary ?? workstream.summary);
}

function buildWorkstreamShortSummary(baseText: string): string {
  return trimSentence(cleanText(baseText), 160);
}

function selectBaseWorkstream(
  primaryType: OutputType,
  workstreams: BossRaidSynthesizedWorkstream[],
): BossRaidSynthesizedWorkstream {
  const preferred =
    primaryType === "patch"
      ? workstreams.find((item) => matchesWorkstreamGroup(item.id, "implementation") && item.patchUnifiedDiff)
      : primaryType === "text" || primaryType === "json"
        ? workstreams.find((item) => matchesWorkstreamGroup(item.id, "answer"))
        : workstreams.find((item) => item.primaryType === primaryType && (item.artifacts?.length ?? 0) > 0);
  return preferred ?? workstreams[0]!;
}

function selectWorkstreamPrimaryType(
  primaryType: OutputType,
  entries: RankedSubmission[],
): OutputType {
  if (entries.some((item) => hasPatch(item.submission.patchUnifiedDiff))) {
    return "patch";
  }

  const artifactType = selectArtifactPrimaryType(entries);
  if (artifactType) {
    return artifactType;
  }

  if (primaryType === "patch" || primaryType === "video" || primaryType === "image" || primaryType === "bundle") {
    return "text";
  }

  return primaryType;
}

function selectArtifactPrimaryType(entries: RankedSubmission[]): OutputType | undefined {
  const artifactOrder: OutputType[] = ["video", "image", "bundle", "json", "text"];
  for (const type of artifactOrder) {
    if (entries.some((item) => (item.submission.artifacts ?? []).some((artifact) => artifact.outputType === type))) {
      return type;
    }
  }

  return undefined;
}

function compareWorkstreams(
  primaryType: OutputType,
  left: WorkstreamGroup,
  right: WorkstreamGroup,
): number {
  const order: readonly string[] = primaryType === "patch" ? PATCH_WORKSTREAM_ORDER : TEXT_WORKSTREAM_ORDER;
  const leftIndex = findWorkstreamGroupIndex(order, left.id);
  const rightIndex = findWorkstreamGroupIndex(order, right.id);
  const leftRank = left.entries[0]?.rank ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right.entries[0]?.rank ?? Number.MAX_SAFE_INTEGER;

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
  }

  return leftRank - rightRank;
}

function findWorkstreamGroupIndex(order: readonly string[], workstreamId: string): number {
  return order.findIndex((group) => matchesWorkstreamGroup(workstreamId, group));
}

function matchesWorkstreamGroup(workstreamId: string, group: string): boolean {
  return workstreamId === group || workstreamId.startsWith(`${group}-`);
}

function getWorkstreamMetadata(entry: RankedSubmission): Pick<WorkstreamGroup, "id" | "label" | "objective"> {
  const role = entry.submission.contributionRole;
  return {
    id: role?.workstreamId ?? role?.id ?? `provider-${entry.submission.providerId}`,
    label: role?.workstreamLabel ?? role?.label ?? entry.submission.providerId,
    objective:
      role?.workstreamObjective ??
      role?.objective ??
      "Provide a valid contribution that Mercenary can synthesize safely.",
  };
}

function collectSupportingSignals(base: RankedSubmission, supportingEntries: RankedSubmission[]): string[] {
  const seen = new Set<string>();
  const baseCandidates = [base.submission.answerText, base.submission.explanation]
    .flatMap((value) => extractSignalCandidates(value))
    .map(toComparableKey);

  for (const candidate of baseCandidates) {
    if (candidate) {
      seen.add(candidate);
    }
  }

  const signals: string[] = [];
  for (const entry of supportingEntries) {
    const next = pickDistinctSignal(entry, seen);
    if (!next) {
      continue;
    }

    signals.push(next.rendered);
    seen.add(next.key);
    if (signals.length >= MAX_SUPPORTING_SIGNALS) {
      break;
    }
  }

  return signals;
}

function pickDistinctSignal(
  entry: RankedSubmission,
  seen: Set<string>,
): { rendered: string; key: string } | undefined {
  const candidates = [entry.submission.answerText, entry.submission.explanation].flatMap((value) =>
    extractSignalCandidates(value),
  );

  for (const candidate of candidates) {
    const key = toComparableKey(candidate);
    if (!key || seen.has(key)) {
      continue;
    }

    const roleLabel = entry.submission.contributionRole?.label;
    return {
      rendered: roleLabel ? `${roleLabel}: ${candidate}` : candidate,
      key,
    };
  }

  return undefined;
}

function extractSignalCandidates(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return cleanText(value)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((line) => cleanText(line))
    .filter((line) => line.length >= 18);
}

function mergeArtifacts(entries: RankedSubmission[]): SubmissionArtifact[] | undefined {
  const artifacts: SubmissionArtifact[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const artifact of entry.submission.artifacts ?? []) {
      const key = `${artifact.outputType}:${artifact.uri}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      artifacts.push(artifact);
    }
  }

  return artifacts.length > 0 ? artifacts : undefined;
}

function collectArtifactsFromWorkstreams(
  workstreams: BossRaidSynthesizedWorkstream[],
): SubmissionArtifact[] | undefined {
  const artifacts: SubmissionArtifact[] = [];
  const seen = new Set<string>();

  for (const workstream of workstreams) {
    for (const artifact of workstream.artifacts ?? []) {
      const key = `${artifact.outputType}:${artifact.uri}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      artifacts.push(artifact);
    }
  }

  return artifacts.length > 0 ? artifacts : undefined;
}

function summarizeArtifactLabels(artifacts: SubmissionArtifact[] | undefined): string | undefined {
  if (!artifacts?.length) {
    return undefined;
  }

  return artifacts
    .map((artifact) => artifact.label)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 4)
    .join(", ");
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimSentence(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const boundary = value.slice(0, maxLength).match(/^(.+[.!?])\s/);
  if (boundary?.[1]) {
    return boundary[1];
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function ensureSentence(value: string): string {
  const trimmed = cleanText(value);
  if (trimmed.length === 0) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function hasPatch(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toComparableKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
