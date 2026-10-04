import { formatUsd } from '@bossraid/proof-ui';

export function formatPer1mTokenPrice(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  const digits = value < 1 ? 3 : 2;
  return formatUsd(value, digits);
}
