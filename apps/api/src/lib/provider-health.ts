import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { probeProviderHealth } from '@bossraid/provider-sdk';
import type { ProviderHealthStatus } from '@bossraid/shared-types';

export async function probeAllProviderHealth(
  orchestrator: BossRaidOrchestrator
): Promise<ProviderHealthStatus[]> {
  return Promise.all(orchestrator.listProviders().map((provider) => probeProviderHealth(provider)));
}
