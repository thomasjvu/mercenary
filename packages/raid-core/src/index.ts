import type {
  RankedSubmission,
  ReputationDelta,
  ReputationEvent,
  RewardComputation,
  RewardPolicy,
} from '@bossraid/shared-types';
import { clamp01, sha256 } from './utils.js';

export {
  TEXT_DOMAIN_SIGNAL_RULES,
  TEXT_DOMAIN_PROVIDER_HINTS,
  classifyTextDomain,
  providerMatchesTextDomain,
  scoreTextDomainFit,
  type TextDomainCategory,
} from './text-domain.js';

export { DEFAULT_TIMEOUTS, DEFAULT_LIMITS } from './constants.js';

export {
  clamp01,
  sha256,
  hashRaidAccessToken,
  countLines,
  scoreSpecialization,
  normalizeLatency,
} from './utils.js';

export { BOUNTY_ESCROW_ABI, ERC20_MINIMAL_ABI } from './contract-abis.js';

export {
  normalizePrice,
  buildRateCardHash,
  readProviderPricing,
  estimateTaskInputTokens,
  estimateTaskOutputTokens,
  estimateTokenMeteredUsd,
  estimateProviderChargeUsd,
} from './pricing.js';

export {
  SETTLEMENT_ESCROW_READ_ABI,
  SETTLEMENT_REGISTRY_READ_ABI,
  SETTLEMENT_ZERO_BYTES32,
  buildChildJobNextAction,
  isTerminalChildJobStatus,
  mapJobLifecycleStatus,
  type SettlementChildJobLifecycleStatus,
} from './settlement-lifecycle.js';

export {
  MODEL_BENCHMARK_TASK_USD,
  MODEL_BENCHMARK_INPUT_PER_1M_USD,
  MODEL_BENCHMARK_OUTPUT_PER_1M_USD,
  estimateBenchmarkTaskUsd,
  estimateBenchmarkPriceUsd,
  computeSavingsUsd,
  computeSavingsPercent,
} from './marketplace-benchmark.js';

export {
  selectProviders,
  computeSelectionScore,
  providerMatchesTask,
  createAssignmentRecords,
  readProviderPrivacyFeatures,
  type ProviderSelectionResult,
} from './selection.js';

export {
  sanitizeTask,
  sanitizeFreeformText,
  sanitizeFailingSignals,
  createRaidRecord,
} from './sanitization.js';

export {
  buildRoutingProof,
  annotateRoutingProof,
  buildRaidQuoteSnapshot,
  rankSubmissions,
} from './routing.js';

export const ReputationDeltas = {
  valid_submission: { global: 0.01, validity: 0.02, quality: 0.01 },
  successful_provider: { global: 0.02, quality: 0.03 },
  invite_timeout: { global: -0.01, responsiveness: -0.03 },
  heartbeat_timeout: { global: -0.02, responsiveness: -0.05 },
  invalid_submission: { global: -0.015, validity: -0.03 },
  duplicate_submission: { global: -0.03, quality: -0.02 },
  security_violation: { global: -0.25 },
} as const satisfies Record<string, ReputationDelta>;

export function computeRewards(
  totalBudget: number,
  ranked: RankedSubmission[],
  _rewardPolicy: RewardPolicy,
  options: { minimumPayoutThresholdUsd?: number } = {}
): RewardComputation {
  const successfulProviders = ranked.filter((item) => item.breakdown.valid);
  const rawPayoutPerProvider =
    successfulProviders.length > 0 ? totalBudget / successfulProviders.length : 0;
  const threshold = Math.max(0, options.minimumPayoutThresholdUsd ?? 0);
  const payoutPerSuccessfulProvider = rawPayoutPerProvider >= threshold ? rawPayoutPerProvider : 0;

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
  context?: Record<string, unknown>
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
