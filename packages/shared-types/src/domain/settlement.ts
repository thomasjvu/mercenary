import type { PrivacyComplianceRecord } from './raid.js';

export interface SettlementSummary {
  successfulProviderCount: number;
  successfulProvidersPaid: number;
  payoutPerSuccessfulProvider: number;
  escrowFundingUsd: number;
  platformMarkupUsd: number;
  minimumPayoutThresholdUsd: number;
  approvedProviderCount: number;
}

export interface SettlementAllocation {
  providerId: string;
  role: 'successful' | 'unsuccessful';
  status: 'complete' | 'reject';
  totalAmount: number;
  deliverableHash?: string;
}

export interface SettlementContractsProof {
  registryAddress: string | null;
  escrowAddress: string | null;
  tokenAddress: string | null;
  clientAddress: string | null;
  evaluatorAddress: string | null;
  chainId: string | null;
  rpcUrl?: string | null;
}

export interface SettlementRegistryCallProof {
  method: 'finalizeRaid';
  args: [string, string];
}

export interface SettlementChildJobProof {
  jobRef: string;
  providerId: string;
  providerAddress?: string | null;
  role: string;
  status: string;
  requestedAction: 'complete' | 'reject';
  lifecycleStatus:
    | 'synthetic'
    | 'open'
    | 'funded'
    | 'submitted'
    | 'completed'
    | 'rejected'
    | 'expired'
    | 'unknown';
  budgetUsd: number;
  budgetAtomic?: string;
  submitResultHash: string | null;
  completionPolicy: string;
  nextAction?: string | null;
  syntheticJobId?: string;
  jobId?: string;
  createTxHash?: string;
  linkTxHash?: string;
  budgetTxHash?: string;
  fundTxHash?: string;
  submitTxHash?: string;
  completeTxHash?: string;
  rejectTxHash?: string;
}

export interface SettlementExecutionRecord {
  mode: 'file' | 'onchain';
  proofStandard: 'erc8183_aligned';
  lifecycleStatus: 'synthetic' | 'partial' | 'terminal';
  executedAt: string;
  artifactPath: string;
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  privacyCompliance?: PrivacyComplianceRecord;
  allocations: SettlementAllocation[];
  contracts: SettlementContractsProof;
  registryCall: SettlementRegistryCallProof;
  childJobs: SettlementChildJobProof[];
  finalizeTxHash?: string;
  transactionHashes?: string[];
  jobIds?: string[];
  warnings?: string[];
}
