import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { probeProviderHealth } from '@bossraid/provider-sdk';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';

export async function probeAllProviderHealth(
  orchestrator: BossRaidOrchestrator
): Promise<ProviderHealthStatus[]> {
  return Promise.all(orchestrator.listProviders().map((provider) => probeProviderHealth(provider)));
}

export async function probeRegisteredProviderHealth(
  provider: ProviderProfile
): Promise<ProviderHealthStatus> {
  return probeProviderHealth(provider);
}
