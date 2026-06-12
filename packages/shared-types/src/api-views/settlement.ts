export type SettlementSummaryResponse = {
  successfulProviderCount: number;
  successfulProvidersPaid: number;
  payoutPerSuccessfulProvider: number;
  escrowFundingUsd?: number;
  platformMarkupUsd?: number;
  minimumPayoutThresholdUsd?: number;
  approvedProviderCount?: number;
};

export type SettlementExecutionResponse = {
  mode: 'file' | 'onchain';
  proofStandard: 'erc8183_aligned';
  lifecycleStatus: 'synthetic' | 'partial' | 'terminal';
  executedAt: string;
  artifactPath: string;
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  contracts: {
    registryAddress: string | null;
    escrowAddress: string | null;
    tokenAddress: string | null;
    clientAddress: string | null;
    evaluatorAddress: string | null;
    chainId: string | null;
    rpcUrl?: string | null;
  };
  registryCall: {
    method: 'finalizeRaid';
    args: [string, string];
  };
  childJobs: Array<{
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
      | 'expired';
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
  }>;
  finalizeTxHash?: string;
  transactionHashes?: string[];
  jobIds?: string[];
  warnings?: string[];
  allocations: Array<{
    providerId: string;
    role: string;
    status: string;
    totalAmount: number;
    deliverableHash?: string;
  }>;
};
