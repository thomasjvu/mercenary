import type { SpecialistTone } from './components/demo/demo-ui';

export function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, ' ').trim();
}

export function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return 'waiting';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatElapsedMs(startedAtMs: number, completedAtMs?: number): string {
  const endMs = completedAtMs ?? Date.now();
  const durationMs = Math.max(endMs - startedAtMs, 0);
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export function formatProgress(progress: number | undefined): string | null {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return null;
  }

  const percentage = progress <= 1 ? progress * 100 : progress;
  const clamped = Math.max(0, Math.min(100, percentage));
  return `${Math.round(clamped)}%`;
}

export function formatLatency(latencyMs: number | undefined): string | null {
  if (typeof latencyMs !== 'number' || Number.isNaN(latencyMs)) {
    return null;
  }

  return `${Math.round(latencyMs)}ms`;
}

export function resolveSpecialistProgress(status: string, progress?: number): number | null {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    const normalized = progress <= 1 ? progress : progress / 100;
    return Math.max(0, Math.min(1, normalized));
  }

  const normalizedStatus = status.toLowerCase();
  if (
    normalizedStatus.includes('approved') ||
    normalizedStatus.includes('submitted') ||
    normalizedStatus.includes('complete') ||
    normalizedStatus.includes('final') ||
    normalizedStatus.includes('paid')
  ) {
    return 1;
  }
  if (normalizedStatus.includes('running')) {
    return 0.72;
  }
  if (normalizedStatus.includes('accepted')) {
    return 0.46;
  }
  if (
    normalizedStatus.includes('invited') ||
    normalizedStatus.includes('selected') ||
    normalizedStatus.includes('queued') ||
    normalizedStatus.includes('pending') ||
    normalizedStatus.includes('reserve')
  ) {
    return 0.18;
  }
  if (
    normalizedStatus.includes('failed') ||
    normalizedStatus.includes('dropped') ||
    normalizedStatus.includes('invalid') ||
    normalizedStatus.includes('timed') ||
    normalizedStatus.includes('disqualified')
  ) {
    return 0.08;
  }

  return null;
}

export function mapStatusTone(status: string): SpecialistTone {
  const normalizedStatus = status.toLowerCase();

  if (
    normalizedStatus.includes('approved') ||
    normalizedStatus.includes('complete') ||
    normalizedStatus.includes('submitted') ||
    normalizedStatus.includes('final')
  ) {
    return 'ready';
  }

  if (
    normalizedStatus.includes('failed') ||
    normalizedStatus.includes('error') ||
    normalizedStatus.includes('cancelled') ||
    normalizedStatus.includes('expired') ||
    normalizedStatus.includes('rejected') ||
    normalizedStatus.includes('dropped') ||
    normalizedStatus.includes('offline')
  ) {
    return 'offline';
  }

  if (
    normalizedStatus.includes('queued') ||
    normalizedStatus.includes('pending') ||
    normalizedStatus.includes('reserve') ||
    normalizedStatus.includes('invited') ||
    normalizedStatus.includes('waiting')
  ) {
    return 'available';
  }

  return 'working';
}

export { uniqueStrings } from '@bossraid/proof-ui';

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const TERMINAL_RAID_STATUSES = new Set(['final', 'cancelled', 'expired']);

export function isTerminalRaidStatus(status: string): boolean {
  return TERMINAL_RAID_STATUSES.has(status);
}

export function humanizeToolCall(tool: string): string {
  switch (tool) {
    case 'provider_http_invite':
      return 'Invited';
    case 'provider_http_accept':
      return 'Accepted';
    case 'provider_http_run':
      return 'Running';
    case 'evaluate_submission':
      return 'Evaluated';
    default:
      return humanizeStatus(tool);
  }
}
