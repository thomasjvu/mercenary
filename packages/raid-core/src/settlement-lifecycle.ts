import type { SettlementChildJobProof } from '@bossraid/shared-types';

export type SettlementChildJobLifecycleStatus = SettlementChildJobProof['lifecycleStatus'];

export const SETTLEMENT_ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

export const SETTLEMENT_REGISTRY_READ_ABI = [
  {
    type: 'function',
    name: 'raids',
    stateMutability: 'view',
    inputs: [{ name: 'raidId', type: 'uint256' }],
    outputs: [
      { name: 'client', type: 'address' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'taskHash', type: 'bytes32' },
      { name: 'evaluationHash', type: 'bytes32' },
      { name: 'finalized', type: 'bool' },
    ],
  },
] as const;

export const SETTLEMENT_ESCROW_READ_ABI = [
  {
    type: 'function',
    name: 'jobs',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'client', type: 'address' },
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'budget', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
      { name: 'status', type: 'uint8' },
      { name: 'description', type: 'string' },
    ],
  },
] as const;

export function isTerminalChildJobStatus(status: SettlementChildJobLifecycleStatus): boolean {
  return status === 'completed' || status === 'rejected' || status === 'expired';
}

export function mapJobLifecycleStatus(status: number): SettlementChildJobLifecycleStatus {
  switch (status) {
    case 0:
      return 'open';
    case 1:
      return 'funded';
    case 2:
      return 'submitted';
    case 3:
      return 'completed';
    case 4:
      return 'rejected';
    case 5:
      return 'expired';
    default:
      return 'open';
  }
}

export function buildChildJobNextAction(
  requestedAction: SettlementChildJobProof['requestedAction'],
  lifecycleStatus: SettlementChildJobLifecycleStatus,
  budgetAtomic: bigint
): string | null {
  if (isTerminalChildJobStatus(lifecycleStatus)) {
    return null;
  }

  if (requestedAction === 'reject') {
    return 'Reject child job is still required from the client or evaluator wallet.';
  }

  if (budgetAtomic <= 0n) {
    return 'Successful child job has zero onchain budget and cannot progress.';
  }

  switch (lifecycleStatus) {
    case 'open':
      return 'Client funding is still required before provider submit.';
    case 'funded':
      return 'Provider submit is still required from the provider wallet.';
    case 'submitted':
      return 'Evaluator completion is still required from the configured evaluator wallet.';
    default:
      return null;
  }
}
