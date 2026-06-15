export type X402AssetTransferMethod = 'permit2' | 'erc7710';

export type DelegationChainEntryType =
  | 'erc7715_grant'
  | 'erc7710_delegation'
  | 'erc7710_redelegation'
  | 'x402_settlement'
  | 'workstream_redelegate'
  | 'oneshot_relay';

export interface DelegationChainEntry {
  type: DelegationChainEntryType;
  at: string;
  from?: string;
  to?: string;
  summary?: string;
  data?: Record<string, unknown>;
}

export interface RaidPaymentProof {
  method: X402AssetTransferMethod;
  payer?: string;
  transaction?: string;
  facilitatorUrl?: string;
  paidAmountUsd?: number;
  delegationChain?: DelegationChainEntry[];
  oneshotTaskId?: string;
  relayTxHash?: string;
  relayStatus?: string;
}

export interface RaidDelegationRecord {
  fromAgent: string;
  toProvider: string;
  workstreamId?: string;
  workstreamLabel?: string;
  budgetCapUsd: number;
  delegatedAt: string;
}

export interface VeniceDirectCallRecord {
  phase: 'plan' | 'synthesize';
  model: string;
  balanceRemainingUsd?: number;
  at: string;
  summary?: string;
}

export interface AgentPaymentSessionGrant {
  wallet: string;
  sessionAccount: string;
  permissionFrom: string;
  permissionContext: string;
  grantedAt: string;
  expiresAt: string;
  weeklyBudgetUsd?: number;
}
