import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import type { RaidProvider } from '@bossraid/provider-sdk';
import {
  FAST_TEST_TIMING,
  readyHealth,
  type TestOrchestratorTiming,
} from '@bossraid/test-fixtures';
import { BossRaidOrchestrator } from './index.js';

export { FAST_TEST_TIMING, type TestOrchestratorTiming };

export function createTestOrchestrator(
  providers: RaidProvider[] = [],
  timing?: Partial<TestOrchestratorTiming>,
  healthCheck: (profile: ProviderProfile) => Promise<ProviderHealthStatus> = async (profile) =>
    readyHealth(profile.providerId)
): BossRaidOrchestrator {
  return new BossRaidOrchestrator(providers, timing, undefined, undefined, healthCheck);
}
