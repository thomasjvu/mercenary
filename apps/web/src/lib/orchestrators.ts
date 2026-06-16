import type { Provider } from '../api.js';

export const MERCENARY_ORCHESTRATOR = {
  id: 'mercenary-v1',
  displayName: 'Mercenary',
  role: 'Orchestrator',
  description:
    'Boss Raid orchestrator — routes verified raiders, enforces budget, and returns one receipt-backed result.',
  specializations: ['orchestration', 'raid routing', 'receipt synthesis'],
} as const;

export function isOrchestratorProvider(provider: Provider): boolean {
  const haystack = [
    provider.providerId,
    provider.agentId,
    provider.displayName,
    provider.description,
    ...provider.specializations,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return haystack.includes('mercenary') || haystack.includes('orchestrat');
}

export function partitionRaiders(providers: Provider[]) {
  const orchestrators: Provider[] = [];
  const specialists: Provider[] = [];

  for (const provider of providers) {
    if (isOrchestratorProvider(provider)) {
      orchestrators.push(provider);
    } else {
      specialists.push(provider);
    }
  }

  return { orchestrators, specialists };
}
