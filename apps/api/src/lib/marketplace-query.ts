import { readPositiveNumber } from './env.js';
import { asSingleQueryValue } from './http.js';

export type MarketplaceQueryParams = {
  modelId?: string;
  modelProvider?: string;
  agentFramework?: string;
  maxBudgetUsd?: number;
  privacyMode?: string;
  verificationStatus?: string;
};

export function parseMarketplaceQuery(query: unknown): MarketplaceQueryParams {
  const params = query as {
    model?: unknown;
    model_id?: unknown;
    provider?: unknown;
    model_provider?: unknown;
    framework?: unknown;
    agent_framework?: unknown;
    max_budget?: unknown;
    max_budget_usd?: unknown;
    privacy_mode?: unknown;
    verification_status?: unknown;
  };

  return {
    modelId: asSingleQueryValue(params.model_id) ?? asSingleQueryValue(params.model),
    modelProvider: asSingleQueryValue(params.model_provider) ?? asSingleQueryValue(params.provider),
    agentFramework:
      asSingleQueryValue(params.agent_framework) ?? asSingleQueryValue(params.framework),
    maxBudgetUsd: readPositiveNumber(
      asSingleQueryValue(params.max_budget_usd) ?? asSingleQueryValue(params.max_budget)
    ),
    privacyMode: asSingleQueryValue(params.privacy_mode),
    verificationStatus: asSingleQueryValue(params.verification_status),
  };
}
