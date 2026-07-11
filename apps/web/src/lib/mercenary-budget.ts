import { DEFAULT_MERCENARY_BUDGET_USD } from '../mercenary-result.js';

export const MIN_MERCENARY_BUDGET_USD = 1;

export function clampMercenaryBudgetUsd(budgetUsd: number, hostMaxBudgetUsd?: number): number {
  const normalized = Number.isFinite(budgetUsd)
    ? Math.max(budgetUsd, MIN_MERCENARY_BUDGET_USD)
    : MIN_MERCENARY_BUDGET_USD;

  if (hostMaxBudgetUsd == null || !Number.isFinite(hostMaxBudgetUsd)) {
    return normalized;
  }

  return Math.min(normalized, Math.max(hostMaxBudgetUsd, MIN_MERCENARY_BUDGET_USD));
}

export function resolveMercenaryBudgetUsd(
  budgetUsd: number | undefined,
  hostMaxBudgetUsd?: number
): number {
  const fallback = hostMaxBudgetUsd ?? DEFAULT_MERCENARY_BUDGET_USD;
  return clampMercenaryBudgetUsd(budgetUsd ?? fallback, hostMaxBudgetUsd);
}

export function formatMercenaryBudgetCap(hostMaxBudgetUsd: number): string {
  return `Public beta max $${hostMaxBudgetUsd.toFixed(2)} per request`;
}

export function buildMercenaryBudgetPreflightError(
  maxBudgetUsd: number,
  hostMaxBudgetUsd: number
): string {
  return `Per-raid budget is $${maxBudgetUsd.toFixed(2)} but this host caps requests at $${hostMaxBudgetUsd.toFixed(2)}. Lower Budget USD and try again.`;
}
