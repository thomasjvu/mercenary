import type { SettlementChildJobLike, SettlementLifecycleStatus } from './types.js';
import { shortValue } from './format.js';

export function buildSettlementLifecycleLabel(
  lifecycleStatus: SettlementLifecycleStatus | undefined
): string {
  switch (lifecycleStatus) {
    case 'terminal':
      return 'terminal';
    case 'partial':
      return 'partial';
    case 'synthetic':
      return 'synthetic';
    default:
      return 'pending';
  }
}

export function findLatestChildJobTxHash(job: SettlementChildJobLike): string | undefined {
  const candidates = [
    job.completeTxHash,
    job.rejectTxHash,
    job.submitTxHash,
    job.fundTxHash,
    job.budgetTxHash,
    job.linkTxHash,
    job.createTxHash,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

export function buildChildJobSummary(job: SettlementChildJobLike): string {
  const txHash = findLatestChildJobTxHash(job);

  return [
    job.role,
    job.status,
    job.lifecycleStatus,
    `action ${job.requestedAction}`,
    job.jobId ?? job.syntheticJobId ?? 'pending',
    job.nextAction ? `next ${job.nextAction}` : null,
    txHash ? shortValue(txHash) : null,
  ]
    .filter((value): value is string => value != null)
    .join(' · ');
}
