import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { BossRaidOrchestrator } from './index.js';
import { FAST_TEST_TIMING, type TestOrchestratorTiming } from './orchestrator-timing.js';

export { FAST_TEST_TIMING, type TestOrchestratorTiming };

export function readyHealth(providerId: string): ProviderHealthStatus {
  return {
    providerId,
    endpoint: `http://127.0.0.1/${providerId}`,
    reachable: true,
    ready: true,
  };
}

export function createTestOrchestrator(
  providers: RaidProvider[] = [],
  timing?: Partial<TestOrchestratorTiming>,
  healthCheck: (profile: ProviderProfile) => Promise<ProviderHealthStatus> = async (profile) =>
    readyHealth(profile.providerId)
): BossRaidOrchestrator {
  return new BossRaidOrchestrator(providers, timing, undefined, undefined, healthCheck);
}
