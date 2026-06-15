import type { DelegationChainEntry } from '@bossraid/shared-types';

export interface RaidSubscriptionGrant {
  wallet: string;
  sessionAccount: string;
  permissionFrom: string;
  permissionContext: string;
  delegationManager?: string;
  grantedAt: string;
  expiresAt: string;
  weeklyBudgetUsd: number;
  delegationChain: DelegationChainEntry[];
}

export interface PaidFetchOptions {
  chainId?: number;
  sessionAccount?: `0x${string}`;
  permissionContext?: string;
  permissionFrom?: `0x${string}`;
  delegationManager?: `0x${string}`;
  delegationChain?: DelegationChainEntry[];
}
