export function shortValue(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function formatUsd(value?: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return digits === 2 ? '$0.00' : 'n/a';
  }

  return `$${value.toFixed(digits)}`;
}

export function formatUsdc(value?: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return digits === 2 ? '0.00 USDC' : 'n/a';
  }

  return `${value.toFixed(digits)} USDC`;
}

export function formatMs(value?: number): string {
  return value == null ? 'n/a' : `${value} ms`;
}

export function formatScore(value?: number): string {
  return value == null ? '0.00' : value.toFixed(2);
}

export type TimestampFormatStyle = 'datetime' | 'time';

export function formatTimestamp(value?: string, style: TimestampFormatStyle = 'datetime'): string {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  if (style === 'time') {
    return parsed.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
