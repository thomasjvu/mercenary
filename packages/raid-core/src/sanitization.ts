import { randomUUID } from 'node:crypto';
import type {
  BossRaidSpawnInput,
  RaidRecord,
  SanitizationIssue,
  SanitizationReport,
  SanitizedTaskSpec,
  SelectedProviders,
  TaskFile,
} from '@bossraid/shared-types';
import { DEFAULT_LIMITS } from './constants.js';
import { buildRoutingProof } from './routing.js';
import { createAssignmentRecords } from './selection.js';
import { sha256 } from './utils.js';

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

function replaceAllMatches(
  input: string,
  patterns: RegExp[],
  replacement: string
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
    content: [...head, '... [redacted middle section] ...', ...tail].join('\n'),
    trimmed: true,
  };
}

function sanitizeFile(
  file: TaskFile,
  redactIdentifiers: boolean
): {
  file: TaskFile;
  secretCount: number;
  identifierCount: number;
  urlCount: number;
  trimmed: boolean;
} {
  const secretResult = replaceAllMatches(file.content, SECRET_PATTERNS, '[REDACTED_SECRET]');
  let content = secretResult.text;
  let identifierCount = 0;
  let urlCount = 0;

  if (redactIdentifiers) {
    const before = content;
    const identifierResult = replaceAllMatches(
      content,
      IDENTIFIER_PATTERNS,
      '[REDACTED_IDENTIFIER]'
    );
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
      severity: 'warn',
      code: 'too_many_files',
      message: `Trimmed payload to ${DEFAULT_LIMITS.maxFiles} files.`,
    });
  }

  if (originalBytes > DEFAULT_LIMITS.maxPayloadBytes) {
    issues.push({
      severity: 'warn',
      code: 'payload_large',
      message: 'Original payload exceeded the preferred byte budget.',
    });
  }

  if (input.constraints.allowExternalSearch) {
    issues.push({
      severity: 'warn',
      code: 'external_search_requested',
      message: 'Provider execution should stay offline for the hackathon MVP.',
    });
  }

  const unsafeContentDetected =
    redactedSecrets > 0 || originalBytes > DEFAULT_LIMITS.maxPayloadBytes;
  const riskTier =
    unsafeContentDetected || input.files.length > DEFAULT_LIMITS.maxFiles
      ? 'unsafe'
      : input.framework === 'unity' || input.failingSignals.errors.length > 0
        ? 'medium'
        : 'safe';

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
  const secretRedacted = replaceAllMatches(input, SECRET_PATTERNS, '[REDACTED_SECRET]');
  const identifierRedacted = replaceAllMatches(
    secretRedacted.text,
    IDENTIFIER_PATTERNS,
    '[REDACTED_IDENTIFIER]'
  );

  return identifierRedacted.text;
}

export function sanitizeFailingSignals<
  T extends { errors: string[]; tests?: string[]; reproSteps?: string[] },
>(input: T): T {
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
  } = {}
): RaidRecord {
  const now = new Date().toISOString();
  const raidId = `raid_${randomUUID()}`;
  const deadlineUnix =
    options.deadlineUnix ??
    Math.ceil((Date.now() + input.constraints.maxLatencySec * 1_000) / 1_000);

  return {
    id: raidId,
    createdAt: now,
    updatedAt: now,
    status: 'queued',
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
