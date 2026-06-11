export function formatUsd(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(digits)}` : 'n/a';
}

export function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : 'n/a';
}

export function formatLatency(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}ms` : 'n/a';
}

export function formatSavingsLabel(
  savingsUsd: number | undefined,
  savingsPercent: number | undefined
): string | null {
  if (savingsUsd == null || savingsUsd <= 0) {
    return null;
  }

  if (savingsPercent != null && savingsPercent > 0) {
    return `${savingsPercent}% off ref · save ${formatUsd(savingsUsd)}`;
  }

  return `save ${formatUsd(savingsUsd)} vs ref`;
}
