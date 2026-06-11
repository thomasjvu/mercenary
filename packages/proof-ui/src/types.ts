export type Erc8004VerificationStatus = 'not_checked' | 'verified' | 'partial' | 'failed' | 'error';

export type SettlementLifecycleStatus = 'pending' | 'partial' | 'terminal' | 'synthetic';

export type SettlementChildJobLike = {
  role: string;
  status: string;
  lifecycleStatus: string;
  requestedAction: string;
  jobId?: string;
  syntheticJobId?: string;
  nextAction?: string | null;
  completeTxHash?: string | null;
  rejectTxHash?: string | null;
  submitTxHash?: string | null;
  fundTxHash?: string | null;
  budgetTxHash?: string | null;
  linkTxHash?: string | null;
  createTxHash?: string | null;
};
